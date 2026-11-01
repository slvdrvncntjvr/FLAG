import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { access, mkdir, readFile, writeFile, symlink, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { assertPortFree } from './e2e-isolation.mjs';
import { createOwnedDirectory, finishOwnedRun, lifecycleDiagnostic, stopOwnedChild, stopOwnedChildren, terminateOwnedTree, trackOwnedChild, waitOwnedChild } from './process-lifecycle.mjs';

const fixture = fileURLToPath(new URL('./process-lifecycle.fixture.mjs', import.meta.url));
async function owned(mode = 'hold', inherit = false) {
  const child = trackOwnedChild(spawn(process.execPath, [fixture, mode], {
    detached: process.platform !== 'win32', windowsHide: true,
    stdio: ['ignore', inherit ? 'inherit' : 'pipe', inherit ? 'inherit' : 'pipe', 'ipc'],
  }));
  // Bound fixture setup independently of stop() so failing tests cannot leak.
  try {
    const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(3000) });
    return { child, ready };
  } catch (error) { await cleanup(child); throw error; }
}
async function cleanup(child, ready) {
  // This path deliberately bypasses a cached failed stop; it only owns fixtures.
  let descendantListening = false;
  if (ready?.port) { try { await assertPortFree(ready.port); } catch { descendantListening = true; } }
  if (ready?.descendantPid && descendantListening && process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(ready.descendantPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
  }
  if (!lifecycleDiagnostic(child).closeObserved) {
    if (process.platform !== 'win32' || child.exitCode === null && child.signalCode === null) terminateOwnedTree(child);
    await waitOwnedChild(child, 3000);
  }
}

test('actual Windows normal-exit race accepts a nonzero synchronous taskkill after bounded close', { skip: process.platform !== 'win32' }, async () => {
  const { child } = await owned('race');
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
    assert.equal(child.exitCode, null, 'event delivery must still be blocked');
    let result;
    await stopOwnedChild(child, () => result = terminateOwnedTree(child), 3000);
    assert.notEqual(result.status, 0, 'the OS process already exited before taskkill');
    assert.equal(child.exitCode, 0);
    const observed = lifecycleDiagnostic(child);
    assert.equal(observed.closeObserved, true);
    assert.equal(observed.stdout.closed, true);
    assert.equal(observed.stderr.closed, true);
  } finally { await cleanup(child); }
});

test('actual kill closes a live child and repeated stops share one termination', async () => {
  const { child } = await owned();
  let calls = 0;
  try {
    const first = stopOwnedChild(child, () => { calls++; return terminateOwnedTree(child); }, 3000);
    const second = stopOwnedChild(child, () => { throw new Error('Must not run'); }, 3000);
    assert.equal(first, second);
    await first;
    await stopOwnedChild(child);
    assert.equal(calls, 1);
    assert.equal(lifecycleDiagnostic(child).closeObserved, true);
  } finally { await cleanup(child); }
});

test('normal exit and inherited stdio close without signalling an already-closed root', async () => {
  const { child } = await owned('race', true);
  try {
    await waitOwnedChild(child, 3000);
    await stopOwnedChild(child, () => { throw new Error('Must not signal a closed PID'); }, 30);
    assert.equal(child.exitCode, 0);
    assert.equal(lifecycleDiagnostic(child).stdout, null);
  } finally { await cleanup(child); }
});

test('a rejected termination with a live child preserves the original error and fails boundedly', async () => {
  const { child } = await owned();
  const denied = Object.assign(new Error('Synthetic private detail must never reach diagnostics'), { code: 'EPERM' });
  const start = Date.now();
  try {
    await assert.rejects(stopOwnedChild(child, () => { throw denied; }, 60), error => {
      assert.equal(error.cause, denied);
      return /did not close/.test(error.message);
    });
    assert.ok(Date.now() - start < 2000);
    assert.equal(child.exitCode, null);
    assert.equal(lifecycleDiagnostic(child).terminationErrorCode, 'EPERM');
    assert.ok(!JSON.stringify(lifecycleDiagnostic(child)).includes('private'));
  } finally { await cleanup(child); }
});

test('a successful termination command alone never substitutes for actual closure', async () => {
  const { child } = await owned();
  try {
    await assert.rejects(stopOwnedChild(child, () => ({ status: 0 }), 60), /did not close/);
    assert.equal(child.exitCode, null);
  } finally { await cleanup(child); }
});

test('nonzero termination status is retained as the timeout cause when a child stays live', async () => {
  const { child } = await owned();
  try {
    await assert.rejects(stopOwnedChild(child, () => ({ status: 128 }), 60), error => {
      assert.match(error.cause.message, /nonzero/);
      return /did not close/.test(error.message);
    });
    assert.equal(lifecycleDiagnostic(child).terminationStatus, 128);
  } finally { await cleanup(child); }
});

test('a failed stop never prevents termination of another owned root', async () => {
  const first = await owned();
  const second = await owned();
  try {
    await assert.rejects(stopOwnedChild(first.child, () => ({ status: 128 }), 30), /did not close/);
    await assert.rejects(stopOwnedChildren([first.child, second.child]), error => {
      assert.equal(error.errors.length, 1);
      return error instanceof AggregateError;
    });
    assert.equal(first.child.exitCode, null);
    assert.equal(lifecycleDiagnostic(second.child).closeObserved, true);
  } finally { await cleanup(first.child); await cleanup(second.child); }
});

test('a failed native stop reports exit 1 without hanging on live child handles', () => {
  const lifecycleUrl = new URL('./process-lifecycle.mjs', import.meta.url).href;
  const script = `
    import { spawn } from 'node:child_process';
    import { trackOwnedChild, stopOwnedChild, unrefFailedOwnedChild, lifecycleDiagnostic } from ${JSON.stringify(lifecycleUrl)};
    const child = trackOwnedChild(spawn(process.execPath, [${JSON.stringify(fixture)}, 'hold'], {
      detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    child.once('spawn', async () => {
      try { await stopOwnedChild(child, () => ({ status: 128 }), 30); }
      catch {
        console.log(JSON.stringify(lifecycleDiagnostic(child)));
        process.exitCode = 1;
        unrefFailedOwnedChild(child);
      }
    });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true, encoding: 'utf8', timeout: 3000 });
  const observed = JSON.parse(result.stdout.trim());
  try {
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(observed.closeObserved, false);
    assert.equal(observed.terminationStatus, 128);
    assert.equal(observed.stdout.closed, false);
  } finally {
    // Only the PID returned by our synthetic runner; this cleanup is bounded.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(observed.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
    else { try { process.kill(-observed.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  }
});

test('spawn errors are observed through close and never trigger a PID kill', async () => {
  const child = trackOwnedChild(spawn(join(import.meta.dirname, 'nonexistent-owned-process'), [], { windowsHide: true }));
  const result = await waitOwnedChild(child, 3000);
  assert.equal(result.spawnErrorCode, 'ENOENT');
  assert.equal(result.closeObserved, true);
  await stopOwnedChild(child, () => { throw new Error('Invalid PID must never be signalled'); }, 30);
});

test('owned process-tree kill closes inherited descendant pipes and releases its ephemeral port', async () => {
  const { child, ready } = await owned('tree');
  try {
    await assert.rejects(assertPortFree(ready.port));
    await stopOwnedChild(child, undefined, 3000);
    const result = lifecycleDiagnostic(child);
    assert.notEqual(result.exitMs, null);
    assert.notEqual(result.closeMs, null);
    assert.equal(result.stdout.closed, true);
    assert.equal(result.stderr.closed, true);
    await assertPortFree(ready.port);
  } finally { await cleanup(child, ready); }
});

test('parent exit and platform pipe closure never substitute for descendant listener release', async () => {
  const { child, ready } = await owned('orphan-pipe');
  try {
    if (child.exitCode === null) await once(child, 'exit', { signal: AbortSignal.timeout(3000) });
    assert.equal(child.exitCode, 0);
    // Windows can close the root's pipe endpoints even while its descendant
    // still listens. POSIX can keep inherited pipes open. Both require the
    // independent port check; neither root exit nor close proves tree exit.
    if (!lifecycleDiagnostic(child).closeObserved) {
      await assert.rejects(stopOwnedChild(child, () => ({ status: 128 }), 60), /did not close/);
    } else {
      await stopOwnedChild(child, () => { throw new Error('Must not kill a closed root PID'); }, 60);
    }
    await assert.rejects(assertPortFree(ready.port));
  } finally { await cleanup(child, ready); }
  await assertPortFree(ready.port);
});

async function directoryWithData() {
  const directory = await createOwnedDirectory('flag-lifecycle-test-');
  await mkdir(join(directory.root, 'app'));
  await writeFile(join(directory.root, 'state.txt'), 'synthetic retained evidence');
  return directory;
}
const remove = directory => finishOwnedRun({ directory, stop: async () => {}, verifyPorts: async () => {}, successful: true });

test('owned directories accept the real E2E prefix and reject path separators', async () => {
  const directory = await createOwnedDirectory('flag-e2e-');
  await remove(directory);
  await assert.rejects(createOwnedDirectory('flag-../outside-'), /Unsafe/);
});

test('uncertain termination retains the owned app/data and fails before cleanup', async () => {
  const directory = await directoryWithData();
  const { child } = await owned();
  let portChecked = false;
  try {
    await assert.rejects(finishOwnedRun({ directory,
      stop: () => stopOwnedChild(child, () => ({ status: 128 }), 60),
      verifyPorts: async () => { portChecked = true; }, successful: true,
    }), /did not close/);
    assert.equal(portChecked, false);
    assert.equal(await readFile(join(directory.root, 'state.txt'), 'utf8'), 'synthetic retained evidence');
    await access(join(directory.root, 'app'));
  } finally { await cleanup(child); await remove(directory); }
});

test('successful cleanup waits for stop and port release, then unlinks its dependency junction safely', async () => {
  const directory = await directoryWithData();
  const dependency = await directoryWithData();
  const link = join(directory.root, 'app', 'node_modules');
  await symlink(dependency.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  const { child, ready } = await owned('server');
  let stopped = false;
  try {
    const result = await finishOwnedRun({ directory, dependencyLink: link, successful: true,
      stop: async () => { await stopOwnedChild(child, undefined, 3000); stopped = true; },
      verifyPorts: async () => { assert.equal(stopped, true); await access(join(directory.root, 'state.txt')); await assertPortFree(ready.port); },
    });
    assert.deepEqual(result, { teardown: 'verified', cleanup: 'removed', portFree: true });
    await assert.rejects(access(directory.root), { code: 'ENOENT' });
    assert.equal(await readFile(join(dependency.root, 'state.txt'), 'utf8'), 'synthetic retained evidence');
  } finally { await cleanup(child); await remove(dependency); }
});

test('port verification failure preserves state after otherwise successful teardown', async () => {
  const directory = await directoryWithData();
  const { child, ready } = await owned('server');
  try {
    await assert.rejects(finishOwnedRun({ directory, stop: async () => {}, verifyPorts: () => assertPortFree(ready.port), successful: true }), /unavailable/);
    await access(join(directory.root, 'state.txt'));
  } finally { await cleanup(child); await remove(directory); }
});

test('failed assertions retain data even with verified teardown and port release', async () => {
  const directory = await directoryWithData();
  try {
    assert.deepEqual(await finishOwnedRun({ directory, stop: async () => {}, verifyPorts: async () => {}, successful: false }), { teardown: 'verified', cleanup: 'retained', portFree: true });
    await access(join(directory.root, 'state.txt'));
  } finally { await remove(directory); }
});

test('cleanup refuses forged roots and dependency paths outside its created temporary root', async () => {
  const directory = await directoryWithData();
  const outside = await directoryWithData();
  try {
    await assert.rejects(remove({ root: outside.root }), /Unsafe/);
    await assert.rejects(finishOwnedRun({ directory, stop: async () => {}, verifyPorts: async () => {}, successful: true, dependencyLink: join(outside.root, 'state.txt') }), /Unsafe/);
    await access(join(outside.root, 'state.txt'));
    await access(join(directory.root, 'state.txt'));
  } finally { await remove(directory); await remove(outside); }
});

test('cleanup refuses a dependency parent redirected outside its temporary root', async () => {
  const directory = await directoryWithData();
  const outside = await directoryWithData();
  const moved = join(directory.root, 'saved-app');
  try {
    await rename(join(directory.root, 'app'), moved);
    await symlink(outside.root, join(directory.root, 'app'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(finishOwnedRun({ directory, stop: async () => {}, verifyPorts: async () => {}, successful: true, dependencyLink: join(directory.root, 'app', 'node_modules') }), /Unsafe/);
    await access(join(outside.root, 'state.txt'));
  } finally {
    await unlink(join(directory.root, 'app'));
    await remove(directory); await remove(outside);
  }
});

test('cleanup refuses a replaced root even when its pathname remains inside OS temp', async () => {
  const directory = await directoryWithData();
  const outside = await directoryWithData();
  const saved = join(outside.root, 'saved-root');
  await rename(directory.root, saved);
  try {
    await mkdir(directory.root);
    await writeFile(join(directory.root, 'unowned.txt'), 'replacement must survive');
    await assert.rejects(remove(directory), /replaced/);
    await access(join(directory.root, 'unowned.txt'));
  } finally {
    // Only this synthetic replacement is removed, through a fresh owned token:
    // move it into the other owned directory before restoring the original.
    await rename(directory.root, join(outside.root, 'replacement'));
    await rename(saved, directory.root);
    await remove(directory); await remove(outside);
  }
});
