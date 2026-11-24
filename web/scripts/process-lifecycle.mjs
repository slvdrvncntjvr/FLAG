import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, lstat, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, dirname, sep } from 'node:path';

const children = new WeakMap();
const directories = new WeakMap();
const exited = child => child.exitCode != null || child.signalCode != null;
const streamsClosed = child => !child.connected && (child.stdio ?? [child.stdin, child.stdout, child.stderr]).every(stream => !stream || stream.closed);
const errorCode = error => ['ENOENT', 'ESRCH', 'EPERM', 'EACCES', 'ETIMEDOUT', 'EINVAL'].includes(error?.code) ? error.code : error ? 'UNKNOWN' : null;

export function trackOwnedChild(child) {
  if (children.has(child)) return child;
  const state = { started: Date.now(), exitMs: null, closeMs: null, closed: false, alreadyClosed: false, stopStartedMs: null, terminationMs: null, spawnError: null, terminationStatus: null, terminationError: null };
  state.closed = exited(child) && streamsClosed(child);
  state.alreadyClosed = state.closed;
  state.closedPromise = new Promise(accept => {
    if (state.closed) return accept();
    child.once('exit', () => { state.exitMs = Date.now() - state.started; });
    child.on('error', error => { state.spawnError ??= error; });
    child.once('close', () => {
      state.closed = true;
      state.closeMs = Date.now() - state.started;
      accept();
    });
  });
  children.set(child, state);
  return child;
}

export function lifecycleDiagnostic(child) {
  const state = children.get(trackOwnedChild(child));
  const streamState = stream => stream ? { closed: !!stream.closed, destroyed: !!stream.destroyed } : null;
  return {
    pid: child.pid ?? null, exitCode: child.exitCode ?? null, signalCode: child.signalCode ?? null,
    exitMs: state.exitMs, closeMs: state.closeMs, closeObserved: state.closed && !state.alreadyClosed, alreadyClosed: state.alreadyClosed,
    stopStartedMs: state.stopStartedMs, terminationMs: state.terminationMs,
    ipcConnected: !!child.connected,
    terminationStatus: state.terminationStatus, terminationErrorCode: errorCode(state.terminationError), spawnErrorCode: errorCode(state.spawnError),
    stdin: streamState(child.stdin), stdout: streamState(child.stdout), stderr: streamState(child.stderr),
  };
}

export async function waitOwnedChild(child, timeoutMs = 10_000) {
  const state = children.get(trackOwnedChild(child));
  let timer;
  try {
    await Promise.race([
      state.closedPromise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned process did not close', { cause: state.terminationError })), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
  return lifecycleDiagnostic(child);
}

export function terminateOwnedTree(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) throw new Error('Owned process has no PID');
  if (process.platform === 'win32') {
    return spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  return { status: 0 };
}

export function stopOwnedChild(child, terminate = () => terminateOwnedTree(child), timeoutMs = 10_000) {
  const state = children.get(trackOwnedChild(child));
  return state.stopPromise ??= (async () => {
    if (state.closed) return lifecycleDiagnostic(child);
    state.stopStartedMs = Date.now() - state.started;
    try {
      const result = terminate();
      state.terminationStatus = result?.status ?? null;
      if (result?.error) state.terminationError = result.error;
      else if (result?.status != null && result.status !== 0) state.terminationError = new Error('Owned termination command returned nonzero');
    } catch (error) { state.terminationError = error; }
    state.terminationMs = Date.now() - state.started - state.stopStartedMs;
    try { return await waitOwnedChild(child, timeoutMs); }
    catch (error) { state.stopFailed = true; throw error; }
  })();
}

export function unrefFailedOwnedChild(child) {
  const state = children.get(child);
  if (!state?.stopFailed) return;
  child.unref();
  for (const stream of child.stdio ?? []) stream?.unref?.();
  child.channel?.unref();
}

export async function stopOwnedChildren(owned) {
  const failures = [];
  for (const child of owned) {
    try { await stopOwnedChild(child); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Owned process teardown is unverified');
}

const inside = (parent, target) => {
  const rel = relative(parent, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export async function createOwnedDirectory(prefix) {
  if (!/^flag-[a-z0-9-]+-$/.test(prefix)) throw new Error('Unsafe temporary prefix');
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, prefix));
  const directory = Object.freeze({ root });
  directories.set(directory, { root: await realpath(root), parent, identity: await lstat(root, { bigint: true }) });
  return directory;
}

async function removeOwnedDirectory(directory, dependencyLink) {
  const owned = directories.get(directory);
  if (!owned || resolve(directory.root) !== owned.root || !inside(owned.parent, owned.root)) throw new Error('Unsafe temporary cleanup path');
  const info = await lstat(owned.root, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== owned.identity.dev || info.ino !== owned.identity.ino || await realpath(owned.root) !== owned.root) throw new Error('Temporary root was replaced');
  if (dependencyLink) {
    const link = resolve(dependencyLink);
    if (!inside(owned.root, link) || !inside(owned.root, await realpath(dirname(link)))) throw new Error('Unsafe dependency junction path');
    try {
      if (!(await lstat(link)).isSymbolicLink()) throw new Error('Dependency path is not a junction or symlink');
      await unlink(link);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await rm(owned.root, { recursive: true, force: true, maxRetries: 12, retryDelay: 500 });
}

export async function finishOwnedRun({ directory, stop, verifyPorts, successful, dependencyLink }) {
  await stop();
  await verifyPorts();
  if (!successful) return { teardown: 'verified', cleanup: 'retained', portFree: true };
  await removeOwnedDirectory(directory, dependencyLink);
  return { teardown: 'verified', cleanup: 'removed', portFree: true };
}
