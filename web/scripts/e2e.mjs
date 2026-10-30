import { cp, mkdtemp, symlink, writeFile, rename, unlink, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { assertPortFree, ownsReadyServer, stopOwnedChild } from './e2e-isolation.mjs';

const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'flag-e2e-'));
const app = join(temp, 'app');
await mkdir(app);
const otpFile = join(temp, 'codes.json');
const children = new Set();
let codes = {};
let codeWrites = Promise.resolve();
let writeError;
let serverLog = '';
let serverStarted = false;
let spawnError;
let stopPromise;
const readyToken = randomBytes(24).toString('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(BETTER_AUTH|BREVO|RESEND|GOOGLE_|CLOUDFLARE_|CF_|NEXTAUTH|NEXT_PUBLIC_|VERCEL_|NEXT_DEV_WRANGLER_ENV|WRANGLER_)/.test(key)));
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false', E2E_OTP_FILE: otpFile,
  E2E_READY_TOKEN: readyToken,
  // Keep Miniflare discovery and diagnostics inside this owned test run, rather
  // than writing to the developer's global Wrangler registry/configuration.
  WRANGLER_REGISTRY_PATH: join(temp, 'wrangler-registry'),
  WRANGLER_LOG_PATH: join(temp, 'wrangler-logs'),
});
function run(file, args, options = {}) {
  if (stopPromise) throw new Error('Local E2E teardown has started');
  const child = spawn(process.execPath, [file, ...args], { cwd: app, env, windowsHide: true, detached: process.platform !== 'win32', ...options });
  children.add(child);
  child.once('error', error => { spawnError = error; });
  child.once('close', () => children.delete(child));
  return child;
}
function done(child) {
  return new Promise((res, rej) => { child.once('error', rej); child.once('close', code => code === 0 ? res() : rej(new Error(`Process failed (${code})`))); });
}
function stop() {
  return stopPromise ??= Promise.all([...children].map(child => stopOwnedChild(child, () => {
    if (process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10_000, windowsHide: true });
      if (result.error) throw result.error;
      // taskkill can lose a race with a child's normal exit while spawnSync
      // prevents Node from processing the queued exit event. The bounded wait
      // below verifies termination after the event loop can observe that exit.
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  })));
}
process.once('SIGINT', () => { stop().catch(error => { console.error(error.message); process.exitCode = 1; }); });
process.once('SIGTERM', () => { stop().catch(error => { console.error(error.message); process.exitCode = 1; }); });
try {
  console.log(`Isolated E2E data: ${temp}`);
  // Refuse an existing listener; never reuse a developer server.
  await assertPortFree();
  for (const name of ['src', 'public', 'drizzle', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'worker-configuration.d.ts']) {
    await cp(join(root, name), join(app, name), { recursive: true });
  }
  const nextConfig = await readFile(join(app, 'next.config.ts'), 'utf8');
  if (!nextConfig.includes('initOpenNextCloudflareForDev();')) throw new Error('Unknown dev config initialization');
  await writeFile(join(app, 'next.config.ts'), nextConfig.replace('initOpenNextCloudflareForDev();', `initOpenNextCloudflareForDev({ remoteBindings: false, persist: { path: ${JSON.stringify(join(temp, 'state', 'v3'))} } });`));
  await symlink(join(root, 'node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(app, 'wrangler.json'), JSON.stringify({
    name: 'flag-local-e2e', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'],
    d1_databases: [{ binding: 'DB', database_name: 'flag-e2e', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: 'drizzle' }],
    r2_buckets: [{ binding: 'PROOFS', bucket_name: 'flag-e2e-proofs', remote: false }],
    vars: { BETTER_AUTH_URL: 'http://localhost:3000', MAIL_FROM: 'FLAG <local@example.invalid>', PRIVATE_INTAKE_ENABLED: 'true' },
  }));
  await writeFile(join(app, '.dev.vars'), `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { mode: 0o600 });
  await writeFile(otpFile, '{}', { mode: 0o600 });
  await done(run(join(root, 'node_modules/wrangler/bin/wrangler.js'), ['d1', 'migrations', 'apply', 'flag-e2e', '--local', '--persist-to', join(temp, 'state')], { stdio: 'ignore', timeout: 60_000 }));
  console.log('Fresh local D1 migrated; starting isolated Next server.');
  await assertPortFree();
  const server = run(join(root, 'scripts/e2e-server.mjs'), [], { stdio: ['ignore', 'pipe', 'pipe'] });
  serverStarted = true;
  let pending = '';
  server.stdout.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      const match = line.match(/\[dev\] sign-in code for ([^:]+): (\d{6})/);
      if (match) {
        codes[match[1]] = match[2];
        const snapshot = JSON.stringify(codes);
        codeWrites = codeWrites.then(async () => {
          await writeFile(otpFile + '.tmp', snapshot, { mode: 0o600 });
          await rename(otpFile + '.tmp', otpFile);
        }).catch(error => { writeError = error; });
      }
      else serverLog = (serverLog + line + '\n').slice(-12000);
    }
  });
  server.stderr.on('data', chunk => { serverLog = (serverLog + chunk.toString().replace(/\b\d{6}\b/g, '[redacted]')).slice(-12000); });
  const deadline = Date.now() + 240_000;
  while (true) {
    if (spawnError) throw new Error('Owned local server could not start', { cause: spawnError });
    if (await ownsReadyServer(server, `http://localhost:3000/__flag_e2e_ready_${readyToken}`, readyToken)) break;
    if (Date.now() > deadline) throw new Error('Local server startup timed out');
    await new Promise(res => setTimeout(res, 500));
  }
  // Compile the auth handler before timing UI interactions on a cold dev build.
  const warmup = await fetch('http://localhost:3000/api/auth/get-session', { signal: AbortSignal.timeout(120_000) });
  if (!warmup.ok) throw new Error('Local auth warmup failed');
  for (const path of ['/home', '/onboarding', '/legal/privacy', '/legal/terms', '/robots.txt']) {
    await fetch('http://localhost:3000' + path, { signal: AbortSignal.timeout(120_000) });
  }
  console.log('Local routes ready; running browser tests.');
  await done(run(join(root, 'node_modules/@playwright/test/cli.js'), ['test', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', timeout: 960_000 }));
} catch (error) {
  console.error(error.message);
  // Codes never enter retained output; only bounded, redacted startup diagnostics.
  console.error(serverLog.replace(/\[dev\].*/g, '[local OTP redacted]'));
  process.exitCode = 1;
} finally {
  // Never erase state if process termination/port release cannot be proved.
  await stop();
  if (serverStarted) await assertPortFree();
  {
    await codeWrites;
    // Unlink the dependency junction before deleting the verified temporary tree.
    await unlink(join(app, 'node_modules')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!resolve(temp).startsWith(resolve(tmpdir()) + '\\') && !resolve(temp).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe temporary path');
    await rm(temp, { recursive: true, force: true, maxRetries: 12, retryDelay: 500 });
  }
  if (writeError) throw new Error('Temporary OTP capture failed');
}
