// Run before changing the harness: `node scripts/process-lifecycle.probe.mjs r8`.
// The r8 mode deliberately exits 1 when the audited smoke predicate rejects an
// actually closed child. Historical E2E is a separate pre-fix helper probe.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { assertPortFree, stopOwnedChild } from './e2e-isolation.mjs';

function ownedPidStatus(pid) {
  try { process.kill(pid, 0); return 'live'; }
  catch (error) { return error.code === 'ESRCH' ? 'exited' : 'unverifiable'; }
}

// Preserve the audited E2E algorithm for an independently repeatable diagnosis;
// the production harness now delegates to process-lifecycle.mjs instead.
async function historicalStopOwnedChild(child, terminate, timeoutMs) {
  let timer;
  let onClose;
  const closed = new Promise(accept => { onClose = accept; child.once('close', onClose); });
  let terminationError;
  try { terminate(); } catch (error) { terminationError = error; }
  try {
    await Promise.race([
      closed,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned process did not close', { cause: terminationError })), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); child.removeListener('close', onClose); }
}

if (process.platform !== 'win32') {
  console.log('Windows-only owned-process diagnosis skipped');
} else {
  const mode = process.argv[2] ?? 'historical-e2e';
  if (!['r8', 'historical-e2e', 'current-e2e'].includes(mode)) throw new Error('Unknown owned-process probe mode');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./process-lifecycle.fixture.mjs', import.meta.url)), mode === 'r8' ? 'race' : 'tree'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const start = Date.now();
  const times = { exitMs: null, closeMs: null };
  child.once('exit', () => { times.exitMs = Date.now() - start; });
  const close = once(child, 'close');
  child.once('close', () => { times.closeMs = Date.now() - start; });
  let kill;
  try {
    const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(3000) });
    if (mode === 'r8') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
    const terminate = () => {
      kill = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
      if (kill.error) throw kill.error;
      return kill;
    };
    let wouldThrow = false;
    if (mode === 'r8') {
      terminate();
      wouldThrow = kill.status !== 0 && child.exitCode === null && child.signalCode === null;
      await Promise.race([close, new Promise((_, reject) => setTimeout(() => reject(new Error('Probe child did not close')), 3000).unref())]);
      process.exitCode = wouldThrow ? 1 : 0;
    } else {
      await (mode === 'historical-e2e' ? historicalStopOwnedChild : stopOwnedChild)(child, terminate, 3000);
    }
    let portFree = null;
    if (ready.port) { try { await assertPortFree(ready.port); portFree = true; } catch { portFree = false; } }
    let descendantTermination = null;
    if (ready.descendantPid) {
      const deadline = Date.now() + 1000;
      do {
        descendantTermination = ownedPidStatus(ready.descendantPid);
        if (descendantTermination === 'exited') break;
        await new Promise(accept => setTimeout(accept, 25));
      } while (Date.now() < deadline);
    }
    console.log(JSON.stringify({ pid: child.pid, descendantPid: ready.descendantPid, terminationStatus: kill?.status, terminationErrorCode: kill?.error?.code ?? null,
      ...times, exitCode: child.exitCode, signalCode: child.signalCode, wouldThrow,
      stdout: { closed: child.stdout.closed, destroyed: child.stdout.destroyed }, stderr: { closed: child.stderr.closed, destroyed: child.stderr.destroyed }, ipcConnected: child.connected, descendantTermination, portFree }));
    if (portFree === false || descendantTermination && descendantTermination !== 'exited') process.exitCode = 1;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
      await Promise.race([close, new Promise(accept => setTimeout(accept, 3000).unref())]);
    }
  }
}
