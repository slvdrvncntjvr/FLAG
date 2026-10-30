import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { isolateOtpIp } from "./network";

function diagnostics(page: Page, label: "owner" | "client") {
  page.on("pageerror", () => console.info(`[F9 ${label}] browser script error (details withheld)`));
  page.on("requestfailed", () => console.info(`[F9 ${label}] request failed (URL/details withheld)`));
  page.on("response", response => {
    const request = response.request(), action = !!request.headers()["next-action"];
    if (request.method() === "POST" && (action || request.isNavigationRequest()))
      console.info(`[F9 ${label}] ${action ? "action" : "form navigation"} HTTP ${response.status()}`);
  });
}

async function enterCode(page: Page, email: string) {
  await isolateOtpIp(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  let code = "";
  await expect.poll(async () => {
    const codes: Record<string, string> = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, "utf8"));
    code = codes[email] ?? "";
    return code.length;
  }).toBe(6);
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function syntheticVerifiedFreelancer(email: string) {
  if (!/^engagement-owner-[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("Synthetic account required");
  const otp = process.env.E2E_OTP_FILE;
  if (!otp || basename(otp) !== "codes.json") throw new Error("Isolated harness required");
  const temp = resolve(dirname(otp));
  if (!basename(temp).startsWith("flag-e2e-")) throw new Error("Isolated harness path required");
  const config = JSON.parse(await readFile(join(temp, "app", "wrangler.json"), "utf8"));
  if (config.name !== "flag-local-e2e" || config.d1_databases?.[0]?.database_name !== "flag-e2e") throw new Error("Synthetic local database required");
  // Synthetic status fixture only: this does not represent an actual ID inspection.
  const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "flag-e2e", "--local", "--persist-to", join(temp, "state"), "--command",
    `INSERT INTO freelancer_profile(user_id,display_name,status) SELECT id,'Synthetic Freelancer','verified' FROM user WHERE email='${email}'`],
  { cwd: join(temp, "app"), encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (result.status !== 0) throw new Error("Synthetic verified fixture failed; output withheld");
}

test("synthetic invite sign-up, explicit acceptance, decline and single-use replay", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const stamp = `${info.project.name}-${Date.now()}`, owner = `engagement-owner-${stamp}@example.invalid`;
  diagnostics(page, "owner");
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Engagement test escaped localhost");
    return route.fallback();
  });
  await test.step("Sign in and onboard synthetic freelancer", async () => {
    console.info("[F9] owner onboarding");
    await page.goto("/sign-in");
    await enterCode(page, owner);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("radio", { name: /^Freelancer/ }).check();
    for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await syntheticVerifiedFreelancer(owner);
    await page.goto("/engagements");
  });
  async function create(title: string) {
    return test.step("Create invitation and read one-time link", async () => {
      console.info("[F9] create invitation");
      await page.getByLabel("Engagement title", { exact: true }).fill(title);
      await page.getByLabel("Client name as you know it", { exact: true }).fill("Private client hint");
      await page.getByLabel("Start date", { exact: true }).fill("2026-10-01");
      const link = page.getByLabel("Invite link", { exact: true });
      const previousLink = await link.count() ? await link.inputValue() : "";
      await page.getByRole("button", { name: "Create invitation", exact: true }).click();
      await expect(link).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
      await expect(link).not.toHaveValue(previousLink);
      return link.inputValue();
    });
  }
  const acceptedLink = await create("Synthetic design work");
  const clientContext = await browser.newContext({ baseURL: "http://localhost:3000", viewport: info.project.use.viewport });
  const client = await clientContext.newPage();
  diagnostics(client, "client");
  await client.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Engagement test escaped localhost");
    return route.fallback();
  });
  try {
    console.info("[F9] client invite landing and sign-in");
    await client.goto(acceptedLink);
    await expect(client.getByText("Synthetic Freelancer", { exact: true })).toBeVisible();
    await expect(client.getByText("Private client hint", { exact: true })).toHaveCount(0);
    await client.getByRole("button", { name: "Continue to sign in or respond" }).click();
    await expect(client).toHaveURL(/\/sign-in\?returnTo=%2Finvite%2Fcontinue$/);
    const pending = (await clientContext.cookies()).find(c => c.name === "flag-pending-invite")!;
    expect(pending.httpOnly).toBe(true);
    expect(pending.sameSite).toBe("Lax");
    expect(pending.path).toBe("/invite");
    expect(pending.value).not.toBe(acceptedLink.split("/").at(-1));
    expect(pending.expires - Date.now() / 1000).toBeLessThanOrEqual(900);
    await enterCode(client, `engagement-client-${stamp}@example.invalid`);
    await expect(client).toHaveURL(/\/onboarding\?returnTo=%2Finvite%2Fcontinue$/);
    await expect(client.getByRole("radio", { name: /^Client/ })).toBeChecked();
    for (const checkbox of await client.getByRole("checkbox").all()) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    await client.getByRole("button", { name: "Accept and continue" }).click();
    await expect(client).toHaveURL(/\/invite\/continue$/);
    await test.step("Query-only accepted status cannot invent consent", async () => {
      await client.goto("/engagements?response=accepted");
      await expect(client.getByText("No engagements yet.", { exact: true })).toBeVisible();
      await expect(client.getByText(/^Consent recorded/)).toHaveCount(0);
      await expect(client.getByText(/Your consent was recorded/)).toHaveCount(0);
      await client.goto("/invite/continue");
    });
    console.info("[F9] explicit client acceptance");
    await client.getByLabel("Display name", { exact: true }).fill("Client Entered Name");
    await client.getByLabel("City (optional)").fill("Quezon City");
    for (const checkbox of await client.getByRole("checkbox").all()) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await client.getByRole("button", { name: "Accept engagement", exact: true }).click();
    await expect(client).toHaveURL(/\/engagements\?response=accepted$/);
    await expect(client.getByText(/^Consent recorded/)).toBeVisible();
    await expect(client.getByRole("heading", { name: "Synthetic design work", exact: true })).toBeVisible();
    expect((await clientContext.cookies()).find(c => c.name === "flag-pending-invite")).toBeUndefined();
    await page.reload();
    await expect(page.getByText(/^Consent recorded/)).toBeVisible();
    await client.goto(acceptedLink);
    await expect(client.getByRole("heading", { name: "This invitation is unavailable" })).toBeVisible();

    await test.step("Two tabs cannot respond to a different pending invitation", async () => {
      const linkA = await create("Cross-tab invitation A");
      const linkB = await create("Cross-tab invitation B");
      await client.goto(linkA);
      await client.getByRole("button", { name: "Continue to sign in or respond" }).click();
      await expect(client).toHaveURL(/\/invite\/continue$/);
      await expect(client.getByText("Cross-tab invitation A", { exact: true })).toBeVisible();
      const cookieA = (await clientContext.cookies()).find(c => c.name === "flag-pending-invite")!.value;
      const otherTab = await clientContext.newPage();
      try {
        await otherTab.goto(linkB);
        await otherTab.getByRole("button", { name: "Continue to sign in or respond" }).click();
        await expect(otherTab).toHaveURL(/\/invite\/continue$/);
        await expect(otherTab.getByText("Cross-tab invitation B", { exact: true })).toBeVisible();
        const cookieB = (await clientContext.cookies()).find(c => c.name === "flag-pending-invite")!.value;
        expect(cookieB).not.toBe(cookieA);
        const target = client.locator('input[name="engagementId"]');
        await expect(target).toHaveCount(2);
        expect(await target.first().inputValue()).not.toBe(cookieB);
        expect(await client.content()).not.toContain(cookieB);
        const responseForms = await client.locator("form").evaluateAll(forms => forms.map(form => form.outerHTML).join(""));
        for (const link of [linkA, linkB]) expect(responseForms).not.toContain(link.split("/").at(-1)!);
        for (const checkbox of await client.getByRole("checkbox").all()) await checkbox.check();
        await client.getByRole("button", { name: "Accept engagement", exact: true }).click();
        await expect(client.locator('form [role="alert"]')).toContainText("Reload and try again");
        await client.getByRole("button", { name: "Decline invitation", exact: true }).click();
        await expect(client.locator('form [role="alert"]')).toHaveCount(2);
        expect((await clientContext.cookies()).find(c => c.name === "flag-pending-invite")!.value).toBe(cookieB);
        // Both links remain live after both stale responses; B can still be
        // accepted from its matching tab using the preserved capability.
        await page.reload();
        for (const title of ["Cross-tab invitation A", "Cross-tab invitation B"]) {
          const card = page.getByRole("heading", { name: title, exact: true }).locator("..");
          await expect(card.getByText("Invited", { exact: true })).toBeVisible();
        }
        for (const checkbox of await otherTab.getByRole("checkbox").all()) await checkbox.check();
        await otherTab.getByRole("button", { name: "Accept engagement", exact: true }).click();
        await expect(otherTab).toHaveURL(/\/engagements\?response=accepted$/);
      } finally { await otherTab.close(); }
    });

    const declineLink = await create("Synthetic second engagement");
    console.info("[F9] client decline and replay");
    await client.goto(declineLink);
    await client.getByRole("button", { name: "Continue to sign in or respond" }).click();
    await expect(client).toHaveURL(/\/invite\/continue$/);
    for (const checkbox of await client.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
    await client.getByRole("button", { name: "Decline invitation", exact: true }).click();
    await expect(client).toHaveURL(/\/engagements\?response=declined$/);
    await expect(client.getByText("Review your engagements below.", { exact: true })).toBeVisible();
    await expect(client.getByRole("heading", { name: "Synthetic second engagement", exact: true })).toHaveCount(0);
    await expect(client.getByText(/^Consent recorded/)).toHaveCount(2);
    await client.goto(declineLink);
    await expect(client.getByRole("heading", { name: "This invitation is unavailable" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Invitation closed", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await clientContext.close(); }
});
