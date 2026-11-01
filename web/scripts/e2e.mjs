import { cp, symlink, writeFile, rename, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { assertPortFree, ownsReadyServer } from './e2e-isolation.mjs';
import { createOwnedDirectory, finishOwnedRun, lifecycleDiagnostic, stopOwnedChildren, trackOwnedChild, unrefFailedOwnedChild, waitOwnedChild } from './process-lifecycle.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = await createOwnedDirectory('flag-e2e-');
const temp = directory.root;
const app = join(temp, 'app');
await mkdir(app);
const otpFile = join(temp, 'codes.json');
const children = new Set();
let codes = {};
let codeWrites = Promise.resolve();
let writeError;
let spawnError;
let stopPromise;
let completed = false;
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
  const child = trackOwnedChild(spawn(process.execPath, [file, ...args], { cwd: app, env, windowsHide: true, detached: process.platform !== 'win32', ...options }));
  children.add(child);
  child.once('error', error => { spawnError = error; });
  return child;
}
async function done(child, timeoutMs) {
  const result = await waitOwnedChild(child, timeoutMs);
  if (result.spawnErrorCode || result.exitCode !== 0) throw new Error('Owned E2E command failed');
}
function stop() {
  return stopPromise ??= stopOwnedChildren(children);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  process.exitCode = 1;
  stop().catch(() => { console.error('Owned E2E teardown is unverified'); });
});
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
  await done(run(join(root, 'node_modules/wrangler/bin/wrangler.js'), ['d1', 'migrations', 'apply', 'flag-e2e', '--local', '--persist-to', join(temp, 'state')], { stdio: 'ignore' }), 60_000);
  console.log('Fresh local D1 migrated; starting isolated Next server.');
  await assertPortFree();
  const server = run(join(root, 'scripts/e2e-server.mjs'), [], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    }
  });
  // Drain output without printing or retaining raw app diagnostics/OTP data.
  server.stderr.resume();
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
  await done(run(join(root, 'node_modules/@playwright/test/cli.js'), ['test', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }), 960_000);
  completed = true;
} catch {
  console.error('Isolated E2E run failed; owned temporary data will be retained');
  process.exitCode = 1;
} finally {
  const successful = completed && !process.exitCode;
  let portsVerified = false;
  let outcome = { teardown: 'unverified', cleanup: 'retained', portFree: null };
  try {
    outcome = await finishOwnedRun({ directory, stop: async () => {
      await stop();
      // No new writes can arrive after all owned streams close.
      await codeWrites;
      if (writeError) throw new Error('Temporary OTP capture failed');
    }, verifyPorts: async () => { await assertPortFree(); portsVerified = true; },
    successful, dependencyLink: join(app, 'node_modules') });
  } catch {
    process.exitCode = 1;
    // A filesystem failure after verified teardown may leave a partially
    // removed successful run. Do not label that state as fully retained.
    outcome.teardown = portsVerified ? 'verified' : 'unverified';
    outcome.cleanup = portsVerified && successful ? 'unverified' : 'retained';
    try { await assertPortFree(); outcome.portFree = true; } catch { outcome.portFree = false; }
    console.error('Owned E2E finalization failed; inspect temporary data');
  }
  for (const child of children) console.log(JSON.stringify({ lifecycle: lifecycleDiagnostic(child) }));
  console.log(JSON.stringify({ ownedRun: 'e2e', ...outcome }));
  if (process.exitCode) for (const child of children) unrefFailedOwnedChild(child);
}
