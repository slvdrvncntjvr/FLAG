import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unstable_readConfig } from "wrangler";

// Run the deployable artifact in workerd, never `next dev`. All mutable state,
// config and credentials are synthetic and confined to an OS temporary folder.
const root = resolve(import.meta.dirname, "..");
const worker = join(root, ".open-next", "worker.js");
await access(worker);
const sourceConfig = unstable_readConfig({ config: join(root, "wrangler.jsonc"), env: "dev" });
const temporary = await mkdtemp(join(tmpdir(), "flag-worker-smoke-"));
const secret = randomBytes(48).toString("base64url");
const children = new Set();
let diagnostics = "";
let spawnError;
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
  const child = spawn(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), ...args], {
    cwd: temporary, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("error", error => { spawnError = error; });
  child.once("exit", () => children.delete(child));
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    diagnostics = (diagnostics + redact(chunk.toString())).slice(-16000);
  });
  return child;
}
function done(child) {
  let timer;
  return new Promise((accept, reject) => {
    // A stuck local migration must reach the outer process-tree cleanup too.
    timer = setTimeout(() => reject(new Error("Local Wrangler command timed out")), 120000);
    child.once("error", reject);
    child.once("exit", code => code === 0 ? accept() : reject(new Error(`Local Wrangler command failed (${code})`)));
  }).finally(() => clearTimeout(timer));
}
async function stop() {
  for (const child of [...children]) {
    const exited = new Promise(accept => child.once("exit", accept));
    if (process.platform === "win32") {
      const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true, stdio: "ignore", timeout: 10000,
      });
      if (result.error) throw result.error;
      if (result.status !== 0 && child.exitCode === null && child.signalCode === null) throw new Error("Owned Wrangler process termination failed");
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    let timer;
    try {
      if (child.exitCode === null && child.signalCode === null) await Promise.race([
        exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned Wrangler process did not exit")), 10000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
}
process.once("SIGINT", () => { stop().catch(() => { process.exitCode = 1; }); });
process.once("SIGTERM", () => { stop().catch(() => { process.exitCode = 1; }); });

try {
  const port = await new Promise((accept, reject) => {
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
  const protectedPages = new Set(["/home", "/onboarding", "/verification", "/moderation/verification", "/moderation/verification/nonexistent"]);
  const paths = ["/", ...protectedPages, "/sign-in", "/legal/privacy", "/legal/terms", "/api/auth/get-session"];
  for (const path of paths) {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    console.log(JSON.stringify({ path, status: response.status }));
    try {
      const protectedPage = protectedPages.has(path);
      assert.equal(response.status, protectedPage ? 307 : 200, `${path}: unexpected status`);
      if (protectedPage) assert.equal(new URL(response.headers.get("location"), base).pathname, "/sign-in");
      if (path !== "/") assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${path}: missing noindex`);
      if (path.startsWith("/legal/")) assert.ok(body.includes("2026-10-14"), `${path}: missing policy version`);
      if (path === "/legal/privacy") assert.ok(!body.includes("permanent record"), "Outdated privacy retention copy");
      if (path === "/api/auth/get-session") assert.equal(body, "null");
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
} catch (error) {
  console.error(redact(error.message));
  console.error(redact(diagnostics));
  process.exitCode = 1;
} finally {
  await stop();
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep) || !temporary.includes("flag-worker-smoke-")) throw new Error("Unsafe temporary cleanup path");
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
