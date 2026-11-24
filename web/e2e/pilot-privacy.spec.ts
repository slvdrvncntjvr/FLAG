import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { isolateOtpIp } from "./network";

const utc = (delta = 0) => new Date(Date.now() + delta).toISOString().slice(0, 16);
async function signIn(page: Page, email: string) {
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Privacy E2E escaped localhost");
    return route.fallback();
  });
  await isolateOtpIp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Code", { exact: true })).toBeVisible();
  let otp = "";
  await expect.poll(async () => {
    const codes: Record<string, string> = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, "utf8"));
    otp = codes[email] ?? ""; return otp.length;
  }).toBe(6);
  await page.getByLabel("Code", { exact: true }).fill(otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: /^Client/ }).check();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}
async function promoteSyntheticAdmin(email: string) {
  if (!/^privacy-admin-[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("Synthetic account required");
  const otpFile = process.env.E2E_OTP_FILE;
  if (!otpFile || basename(otpFile) !== "codes.json") throw new Error("Isolated E2E harness required");
  const temp = resolve(dirname(otpFile));
  if (!basename(temp).startsWith("flag-e2e-")) throw new Error("Isolated E2E path required");
  const config = JSON.parse(await readFile(join(temp, "app", "wrangler.json"), "utf8"));
  if (config.name !== "flag-local-e2e" || config.d1_databases?.[0]?.database_name !== "flag-e2e") throw new Error("Synthetic local database required");
  const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "flag-e2e", "--local", "--persist-to", join(temp, "state"), "--command", `UPDATE user SET role='admin' WHERE email='${email}'`], {
    cwd: join(temp, "app"), encoding: "utf8", timeout: 60_000, windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Synthetic role setup failed; output withheld");
}
async function record(page: Page, email: string, kind: "export" | "closure") {
  await page.goto("/admin/privacy");
  const before = await page.locator('a[href^="/admin/privacy/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("href")));
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Record request", exact: true }) });
  await expect(form).toHaveCount(1);
  const option = form.getByLabel("Subject account").locator("option").filter({ hasText: email });
  const subjectId = (await option.getAttribute("value"))!;
  await form.getByLabel("Subject account").selectOption(subjectId);
  await test.step(`Select ${kind} request kind`, async () => { await form.locator('select[name="kind"]').selectOption(kind, { timeout: 15000 }); });
  await form.locator('[name="receivedAt"]').fill(utc(-60000));
  await form.locator('[name="dueAt"]').fill(utc(86400000));
  await form.getByRole("button", { name: "Record request", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  const links = await page.locator('a[href^="/admin/privacy/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("href")));
  const href = links.find(link => link && !before.includes(link));
  expect(href).toBeTruthy(); await page.goto(href!);
  return subjectId;
}
async function assess(page: Page, subjectId: string, kind: "export" | "closure") {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Record verified assessment", exact: true }) });
  await form.locator('[name="identityMethod"]').selectOption("authenticated_account");
  await form.locator('[name="identityReference"]').fill("synthetic-live-session");
  for (const category of ["identity", "authentication", "invitations", "publication", "proofs", "consent", "history", "backups"]) {
    await form.locator(`[name="basis:${category}"]`).fill("Synthetic finite account purpose and pending copy assessment");
  }
  if (kind === "closure") {
    for (const target of await form.locator('input[name="target"]').all()) {
      const value = JSON.parse(await target.inputValue());
      if (value.targetType === "user" && value.targetId === subjectId) await target.check();
    }
    await form.locator(`[name="op:user:${subjectId}"]`).selectOption("redact_identity");
    await form.locator('[name="basis"]').selectOption("account_closure");
  } else {
    await form.locator('[name="exportCategory"][value="account"]').check();
    await form.locator('[name="exportKind"]').selectOption("session");
    await form.locator('[name="handoverReference"]').fill("synthetic-subject-session");
    await form.locator('[name="exportDeadline"]').fill(utc(3600000));
  }
  await form.getByRole("button", { name: "Record verified assessment", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
}

test("staff assessment delivers single-use metadata, then closure denies the existing subject session", async ({ page, browser }, testInfo) => {
  test.setTimeout(240000);
  const stamp = `${Date.now()}-${testInfo.project.name}`, email = `privacy-subject-${stamp}@example.invalid`, adminEmail = `privacy-admin-${stamp}@example.invalid`;
  const subjectContext = await browser.newContext({ baseURL: "http://localhost:3000" }), subject = await subjectContext.newPage();
  try {
    await test.step("Sign in synthetic subject", () => signIn(subject, email));
    await test.step("Sign in synthetic processor", () => signIn(page, adminEmail));
    await promoteSyntheticAdmin(adminEmail);
    const subjectId = await test.step("Record export request", () => record(page, email, "export"));
    await test.step("Assess metadata export", () => assess(page, subjectId, "export"));
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Prepare assessed metadata export", exact: true }) });
    await form.getByRole("button", { name: "Prepare assessed metadata export", exact: true }).click();
    await expect(form.locator("code")).toHaveCount(2);
    const delivery = (await form.locator("code").nth(0).textContent())!, token = (await form.locator("code").nth(1).textContent())!;
    const path = `/api/privacy/exports/${delivery}`;
    expect((await page.request.get(path, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404);
    const response = await subject.request.get(path, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json(); expect(body.account.id).toBe(subjectId); expect(body.proofFilesIncluded).toBe(false);
    expect((await subject.request.get(path, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404);
    await record(page, email, "closure"); await assess(page, subjectId, "closure");
    const execute = page.locator("form").filter({ has: page.getByRole("button", { name: "Execute due assessed actions", exact: true }) });
    await execute.getByRole("button", { name: "Execute due assessed actions", exact: true }).click();
    await expect(execute.getByRole("status")).toContainText("tasks completed");
    await subject.goto("/home"); await expect(subject).toHaveURL(/\/sign-in$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await subjectContext.close(); }
});
