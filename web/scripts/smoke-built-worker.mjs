import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import net from "node:net";
import { join, resolve } from "node:path";
import { unstable_readConfig } from "wrangler";
import { getCliEnvironment } from "./check-ci-target.mjs";
import { checkResourceBindings } from "./check-resource-bindings.mjs";
import { ANONYMOUS_ROUTES, checkAnonymousRoute } from "./release-routes.mjs";
import { assertPortFree } from "./e2e-isolation.mjs";
import { createOwnedDirectory, finishOwnedRun, lifecycleDiagnostic, stopOwnedChildren, trackOwnedChild, unrefFailedOwnedChild, waitOwnedChild } from "./process-lifecycle.mjs";

// Run the deployable artifact in workerd, never `next dev`. All mutable state,
// config and credentials are synthetic and confined to an OS temporary folder.
const root = resolve(import.meta.dirname, "..");
const worker = join(root, ".open-next", "worker.js");
await access(worker);
// Existing invocations select dev; --env= explicitly selects the production
// compatibility settings while runtime bindings remain entirely synthetic.
const environment = getCliEnvironment() ?? "dev";
const sourceConfig = unstable_readConfig({ config: join(root, "wrangler.jsonc"), env: environment });
checkResourceBindings(sourceConfig, environment);
const directory = await createOwnedDirectory("flag-worker-smoke-");
const temporary = directory.root;
const secret = randomBytes(48).toString("base64url");
const children = new Set();
let diagnostics = "";
let spawnError;
let stopPromise;
let completed = false;
let port;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|home|userprofile|localappdata|appdata|programdata|programfiles(?:\(x86\))?|number_of_processors)$/i.test(key)));
Object.assign(env, {
  CI: "true", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", WRANGLER_LOG_PATH: join(temporary, "wrangler.log"),
  // Wrangler's global auth/config/registry must also stay outside the real
  // user profile, even though every operation below is explicitly local.
  HOME: temporary, USERPROFILE: temporary, APPDATA: temporary, LOCALAPPDATA: temporary,
  XDG_CONFIG_HOME: temporary, XDG_CACHE_HOME: temporary, XDG_DATA_HOME: temporary,
});
const redact = text => text.replaceAll(secret, "[synthetic secret redacted]")
  .replace(/\[dev\] sign-in code[^\r\n]*/g, "[local code redacted]");
function run(args) {
  if (stopPromise) throw new Error("Packaged smoke teardown has started");
  const child = trackOwnedChild(spawn(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), ...args], {
    cwd: temporary, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  }));
  children.add(child);
  child.once("error", error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    diagnostics = (diagnostics + redact(chunk.toString())).slice(-16000);
  });
  return child;
}
async function done(child) {
  const result = await waitOwnedChild(child, 120_000);
  if (result.spawnErrorCode || result.exitCode !== 0) throw new Error("Local Wrangler command failed");
}
function stop() {
  return stopPromise ??= stopOwnedChildren(children);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  process.exitCode = 1;
  stop().catch(() => { console.error("Owned smoke teardown is unverified"); });
});

try {
  console.log(`Isolated packaged-smoke data: ${temporary}`);
  port = await new Promise((accept, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => accept(port)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const config = join(temporary, "wrangler.json");
  const persist = join(temporary, "state");
  await writeFile(config, JSON.stringify({
    name: "flag-packaged-smoke", main: worker,
    compatibility_date: sourceConfig.compatibility_date, compatibility_flags: sourceConfig.compatibility_flags,
    assets: { directory: join(root, ".open-next/assets"), binding: "ASSETS" },
    d1_databases: [{ binding: "DB", database_name: "flag-smoke", database_id: "00000000-0000-0000-0000-000000000001", migrations_dir: join(root, "drizzle"), remote: false }],
    r2_buckets: [{ binding: "PROOFS", bucket_name: "flag-smoke-proofs", remote: false }],
    vars: { BETTER_AUTH_URL: base, MAIL_FROM: "FLAG <local@example.invalid>" },
  }));
  await writeFile(join(temporary, ".dev.vars"), `BETTER_AUTH_SECRET=${secret}\n`, { mode: 0o600 });
  await done(run(["d1", "migrations", "apply", "flag-smoke", "--local", "--persist-to", persist, "--config", config]));
  diagnostics = "";
  const server = run(["dev", "--local", "--config", config, "--persist-to", persist,
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--show-interactive-dev-session=false"]);
  const deadline = Date.now() + 120000;
  while (true) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) throw new Error("Packaged Worker exited during startup");
    // Readiness is Wrangler's listener signal. Repeated timed-out HTTP probes
    // can leave cold-start requests running and obscure the first real error.
    if (diagnostics.includes("Ready on http://")) break;
    if (Date.now() > deadline) throw new Error("Packaged Worker startup timed out");
    await new Promise(accept => setTimeout(accept, 250));
  }
  const failures = [];
  const paths = ANONYMOUS_ROUTES;
  for (const path of paths) {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    console.log(JSON.stringify({ path, status: response.status }));
    try {
      checkAnonymousRoute({ path, response, body, base });
    } catch (error) { failures.push(error.message); }
  }
  assert.deepEqual(failures, [], "Packaged Worker anonymous route checks failed");
  // Invalid verification codes touch only synthetic local limiter state. They
  // never call a send-code endpoint, print a code or create an account.
  const statuses = [];
  const email = `worker-smoke-${randomUUID()}@example.invalid`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(base + "/api/auth/sign-in/email-otp", {
      method: "POST", headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": "192.0.2.1" },
      body: JSON.stringify({ email, otp: "000000" }), signal: AbortSignal.timeout(20000),
    });
    statuses.push(response.status);
    await response.arrayBuffer();
    if (attempt === 5) assert.ok(Number(response.headers.get("retry-after")) > 0, "Missing retry delay");
  }
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
  console.log(JSON.stringify({ packagedWorkerVerified: true, routes: paths.length, otpStatuses: statuses, mailSent: false }));
  completed = true;
} catch {
  console.error("Packaged smoke failed; owned temporary data will be retained");
  process.exitCode = 1;
} finally {
  const successful = completed && !process.exitCode;
  let portsVerified = false;
  let outcome = { teardown: "unverified", cleanup: "retained", portFree: null };
  try {
    outcome = await finishOwnedRun({ directory, stop, verifyPorts: async () => {
      if (port) await assertPortFree(port);
      portsVerified = true;
    }, successful });
    if (!port) outcome.portFree = null;
  } catch {
    process.exitCode = 1;
    outcome.teardown = portsVerified ? "verified" : "unverified";
    outcome.cleanup = portsVerified && successful ? "unverified" : "retained";
    if (port) { try { await assertPortFree(port); outcome.portFree = true; } catch { outcome.portFree = false; } }
    console.error("Owned smoke finalization failed; inspect temporary data");
  }
  for (const child of children) console.log(JSON.stringify({ lifecycle: lifecycleDiagnostic(child) }));
  console.log(JSON.stringify({ ownedRun: "packaged-smoke", ...outcome }));
  if (process.exitCode) for (const child of children) unrefFailedOwnedChild(child);
}
