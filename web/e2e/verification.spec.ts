import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { isolateOtpIp } from "./network";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Verification E2E request escaped localhost");
    return route.fallback();
  });
});

async function signIn(page: Page, email: string, role: "freelancer" | "client") {
  await isolateOtpIp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Code", { exact: true })).toBeVisible();
  let otp = "";
  await expect.poll(async () => {
    const codes: Record<string, string> = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, "utf8"));
    otp = codes[email] ?? "";
    return otp.length;
  }).toBe(6);
  await page.getByLabel("Code", { exact: true }).fill(otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: role === "freelancer" ? /^Freelancer/ : /^Client/ }).check();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

// Only the existing harness's fresh, synthetic, local D1 may receive a test role.
// No production/dev DB identifier, credential or arbitrary SQL is accepted.
async function setLocalTestRole(email: string, role: "moderator" | "admin") {
  if (!/^verification-[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("Non-synthetic test account refused");
  await executeLocalFixture(`UPDATE user SET role='${role}' WHERE email='${email}'`);
}

async function seedOlderQueueRequest(mobile: boolean) {
  const ownerId = randomUUID(), requestId = randomUUID(), reviewId = randomUUID();
  const name = mobile ? "Sam Santos Reyes" : "Sam Santos Cruz";
  // Fixed statements in a freshly migrated, synthetic database only. Inserting
  // historical fixtures preserves the application's immutable submission time.
  await executeLocalFixture(`
    INSERT INTO user(id,name,email,email_verified,role) VALUES('${ownerId}','${name}','verification-queue-${ownerId}@example.invalid',1,'freelancer');
    INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('${ownerId}','${name}','pending');
    INSERT INTO portfolio_link(id,freelancer_id,url,label) VALUES('${randomUUID()}','${ownerId}','https://example.invalid/work','Work samples');
    INSERT INTO verification_case(id,freelancer_id,created_at) VALUES('${requestId}','${ownerId}',strftime('%Y-%m-%dT%H:%M:%fZ','now','-37 hours'));
    INSERT INTO moderation_case(id,kind,subject_id,created_at) SELECT '${reviewId}','verification',id,created_at FROM verification_case WHERE id='${requestId}';
  `);
  return name;
}

async function executeLocalFixture(command: string) {
  const otpFile = process.env.E2E_OTP_FILE;
  if (!otpFile || basename(otpFile) !== "codes.json") throw new Error("Isolated E2E harness required");
  const temp = resolve(dirname(otpFile));
  if (!basename(temp).startsWith("flag-e2e-")) throw new Error("Isolated E2E path required");
  const config = JSON.parse(await readFile(join(temp, "app", "wrangler.json"), "utf8"));
  if (config.name !== "flag-local-e2e" || config.d1_databases?.[0]?.database_name !== "flag-e2e") throw new Error("Synthetic local database required");
  const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "flag-e2e", "--local", "--persist-to", join(temp, "state"), "--command", command], {
    cwd: join(temp, "app"), encoding: "utf8", timeout: 60_000, windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Synthetic local fixture setup failed; command output withheld");
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("verification routes enforce signed-in and freelancer/reviewer roles", async ({ page }) => {
  await page.goto("/verification");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/moderation/verification");
  await expect(page).toHaveURL(/\/sign-in$/);
  const email = `verification-admin-${Date.now()}@example.invalid`;
  await signIn(page, email, "client");
  expect((await page.goto("/verification"))?.status()).toBe(404);
  expect((await page.goto("/moderation/verification"))?.status()).toBe(404);
  await setLocalTestRole(email, "admin");
  expect((await page.goto("/moderation/verification"))?.status()).toBe(404);
  await noOverflow(page);
});

test("rejected requests keep their original profile and numeric portfolio after corrected resubmission", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const originalName = "Alex Rivera";
  const correctedName = testInfo.project.name === "mobile-360" ? "Sam Santos Mobile" : "Sam Santos Desktop";
  const originalUrl = "https://example.invalid/projects/123456/brand-design";
  const correctedUrl = "https://example.invalid/projects/654321/new-work";
  await signIn(page, `verification-history-owner-${stamp}@example.invalid`, "freelancer");
  await page.goto("/verification");
  await page.getByLabel("Account/profile name", { exact: true }).fill(originalName);
  await page.getByLabel("City (optional)").fill("Original city");
  await page.getByLabel("Portfolio URL 1", { exact: true }).fill(originalUrl);
  await page.getByLabel("Link label 1 (optional)").fill("Original portfolio");
  await page.getByRole("button", { name: "Submit verification request", exact: true }).click();
  await expect(page.getByText("Pending review", { exact: true })).toBeVisible();

  const reviewerContext = await browser.newContext({ baseURL: "http://localhost:3000", viewport: page.viewportSize()! });
  const reviewer = await reviewerContext.newPage();
  await reviewer.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("History E2E request escaped localhost");
    return route.fallback();
  });
  try {
    const email = `verification-history-reviewer-${stamp}@example.invalid`;
    await signIn(reviewer, email, "client");
    await setLocalTestRole(email, "moderator");
    await reviewer.goto("/moderation/verification");
    await reviewer.getByRole("link", { name: originalName, exact: true }).click();
    await expect(reviewer).toHaveURL(/\/moderation\/verification\/[^/]+$/);
    await expect(reviewer.getByRole("heading", { name: "Verification review", exact: true })).toBeVisible();
    const originalReview = reviewer.url();
    await reviewer.getByRole("button", { name: "Claim review", exact: true }).click();
    await reviewer.getByLabel("ID kind inspected").selectOption("passport");
    await reviewer.getByLabel("Inspection result").selectOption("pass");
    await reviewer.getByRole("radio", { name: "Yes, matches", exact: true }).check();
    await reviewer.getByRole("checkbox").check();
    await reviewer.getByRole("button", { name: "Record live inspection", exact: true }).click();
    await expect(reviewer.getByText(/^Pass; name matches/)).toBeVisible();
    await reviewer.getByRole("combobox", { name: "Decision", exact: true }).selectOption("reject");
    await reviewer.getByLabel("Reason (shared with the freelancer)").fill("Portfolio needs additional work samples.");
    await reviewer.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(reviewer.getByText("Rejected", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await page.getByLabel("Account/profile name", { exact: true }).fill(correctedName);
    await page.getByLabel("City (optional)").fill("Corrected city");
    await page.getByLabel("Portfolio URL 1", { exact: true }).fill(correctedUrl);
    await page.getByLabel("Link label 1 (optional)").fill("Corrected portfolio");
    await page.getByRole("button", { name: "Submit verification request", exact: true }).click();
    await expect(page.getByText("Pending review", { exact: true })).toBeVisible();
    await expect(page.getByText(correctedName, { exact: true })).toBeVisible();

    await reviewer.goto(originalReview);
    await expect(reviewer.getByText(originalName, { exact: true })).toBeVisible();
    await expect(reviewer.getByText("Original city", { exact: true })).toBeVisible();
    await expect(reviewer.getByRole("link", { name: /^Original portfolio/ })).toHaveAttribute("href", originalUrl);
    await expect(reviewer.getByText(/^Pass; name matches/)).toBeVisible();
    await expect(reviewer.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(reviewer.getByText("Portfolio needs additional work samples.", { exact: true })).toBeVisible();
    await expect(reviewer.getByText(correctedName, { exact: true })).toHaveCount(0);
    await expect(reviewer.locator(`a[href="${correctedUrl}"]`)).toHaveCount(0);
    await noOverflow(reviewer);

    await reviewer.goto("/moderation/verification");
    await reviewer.getByRole("link", { name: correctedName, exact: true }).click();
    expect(reviewer.url()).not.toBe(originalReview);
    await expect(reviewer.getByText(correctedName, { exact: true })).toBeVisible();
    await expect(reviewer.getByRole("link", { name: /^Corrected portfolio/ })).toHaveAttribute("href", correctedUrl);
    await expect(reviewer.getByText("Not recorded", { exact: true })).toBeVisible();
    await noOverflow(page);
  } finally {
    await reviewerContext.close();
  }
});

test("real owner request, recoverable error, claim, inspection and reasoned approval", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const ownerName = "Alex Rivera";
  await signIn(page, `verification-owner-${stamp}@example.invalid`, "freelancer");
  await page.getByRole("link", { name: "View verification or request an identity check" }).click();
  await expect(page.getByRole("heading", { name: "Verification", exact: true })).toBeVisible();
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  expect(await page.locator('input[type="file"]').count()).toBe(0);
  await page.getByLabel("Account/profile name", { exact: true }).fill(ownerName);
  await page.getByLabel("City (optional)").fill("Test city");
  await page.getByLabel("Portfolio URL 1", { exact: true }).fill("https://example.invalid/work");
  await page.getByLabel("Link label 1 (optional)").fill("Work samples");
  // A forged principal is rejected by the action instead of reaching the backend.
  await page.locator("form").evaluate(form => {
    const input = document.createElement("input"); input.name = "actorId"; input.value = "forged-principal"; input.type = "hidden"; form.append(input);
  });
  await page.getByRole("button", { name: "Submit verification request" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit verification request" })).toBeEnabled();
  await expect(page.getByLabel("Account/profile name", { exact: true })).toHaveValue(ownerName);
  await page.locator('input[name="actorId"]').evaluate(input => input.remove());
  await page.getByRole("button", { name: "Submit verification request" }).click();
  await expect(page.getByText("Pending review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit verification request" })).toHaveCount(0);
  await noOverflow(page);
  console.info("Verification workflow: requester pending; starting reviewer.");

  const reviewerContext = await browser.newContext({ baseURL: "http://localhost:3000", viewport: page.viewportSize()! });
  const reviewer = await reviewerContext.newPage();
  await reviewer.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Reviewer E2E request escaped localhost");
    return route.fallback();
  });
  let primaryError: unknown;
  try {
    const reviewerEmail = `verification-reviewer-${stamp}@example.invalid`;
    await signIn(reviewer, reviewerEmail, "client");
    await setLocalTestRole(reviewerEmail, "moderator");
    const olderName = await seedOlderQueueRequest(testInfo.project.name === "mobile-360");
    await reviewer.goto("/home");
    await reviewer.getByRole("link", { name: "Open verification review queue" }).click();
    const olderRow = reviewer.getByRole("listitem").filter({ has: reviewer.getByRole("link", { name: olderName, exact: true }) });
    const newRow = reviewer.getByRole("listitem").filter({ has: reviewer.getByRole("link", { name: ownerName, exact: true }) });
    await expect(olderRow.getByText("Waiting 37 hours", { exact: true })).toBeVisible();
    await expect(olderRow.getByText("Overdue — waiting more than 36 hours", { exact: true })).toBeVisible();
    await expect(newRow.getByText("Waiting 0 hours", { exact: true })).toBeVisible();
    await expect(newRow.getByText(/Overdue/)).toHaveCount(0);
    const orderedNames = await reviewer.locator("main li a").allTextContents();
    expect(orderedNames.indexOf(olderName)).toBeLessThan(orderedNames.indexOf(ownerName));
    await noOverflow(reviewer);
    console.info("Verification workflow: queue ages and order checked; claiming review.");
    await reviewer.getByRole("link", { name: ownerName, exact: true }).click();
    expect(await reviewer.locator('input[type="file"]').count()).toBe(0);
    await reviewer.getByRole("button", { name: "Claim review", exact: true }).click();
    await expect(reviewer.getByRole("heading", { name: "Record a live inspection" })).toBeVisible();
    const lease = await reviewer.locator('input[name="expectedClaimUntil"]').first().inputValue();
    expect(lease).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z$/);
    await reviewer.getByLabel("ID kind inspected").selectOption("passport");
    await reviewer.getByLabel("Inspection result").selectOption("fail");
    await reviewer.getByRole("radio", { name: "No, does not match", exact: true }).check();
    await reviewer.getByRole("checkbox").check();
    await reviewer.getByRole("button", { name: "Record live inspection", exact: true }).click();
    await expect(reviewer.getByText(/^Fail; name does not match/)).toBeVisible();
    await expect(reviewer.locator('option[value="approve"]')).toHaveJSProperty("disabled", true);
    console.info("Verification workflow: failed inspection recorded; approval remains disabled.");
    await reviewer.getByLabel("ID kind inspected").selectOption("passport");
    await reviewer.getByLabel("Inspection result").selectOption("pass");
    await reviewer.getByRole("radio", { name: "Yes, matches", exact: true }).check();
    await reviewer.getByRole("checkbox").check();
    await reviewer.getByRole("button", { name: "Record live inspection", exact: true }).click();
    await expect(reviewer.getByText(/^Pass; name matches/)).toBeVisible();
    console.info("Verification workflow: passing inspection rendered; checking approval controls.");
    // Match the accessible control name; label textContent also includes the
    // nested select's options, so an exact getByLabel("Decision") misses it.
    const decision = reviewer.getByRole("combobox", { name: "Decision", exact: true });
    await test.step("A passing inspection enables the approval option", async () => {
      await expect(reviewer.locator('option[value="approve"]')).toHaveJSProperty("disabled", false);
      await expect(decision).toBeEnabled();
    });
    await decision.selectOption("approve");
    await expect(decision).toHaveValue("approve");
    await reviewer.getByLabel("Reason (shared with the freelancer)").fill("Live identity inspection passed and portfolio reviewed.");
    await noOverflow(reviewer);
    await expect(reviewer.getByRole("button", { name: "Record decision", exact: true })).toBeEnabled();
    expect(await reviewer.locator('form').filter({ has: reviewer.getByRole("heading", { name: "Decide verification" }) })
      .evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
    console.info("Verification workflow: valid approval form; submitting decision.");
    await reviewer.getByRole("button", { name: "Record decision", exact: true }).click();
    await expect(reviewer.getByText("Approved — identity checked", { exact: true })).toBeVisible();
    await expect(reviewer.getByText("verification decided", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Verified — identity checked", { exact: true })).toBeVisible();
    await expect(page.getByText("Live identity inspection passed and portfolio reviewed.", { exact: true })).toBeVisible();
    await expect(page.getByText("Verification means your identity has been checked. It does not guarantee trustworthiness.")).toBeVisible();
    await noOverflow(page);
  } catch (error) {
    primaryError = error;
    // The default fixture page belongs to the requester; retain the reviewer
    // separately so an approval stall has the relevant state and controls.
    await testInfo.attach("reviewer-state", {
      body: await reviewer.locator("main").innerText({ timeout: 2000 }).catch(() => "Reviewer page unavailable"),
      contentType: "text/plain",
    }).catch(() => {});
    await testInfo.attach("reviewer-controls", {
      body: JSON.stringify(await reviewer.locator("form").evaluateAll(forms => (forms as HTMLFormElement[]).map(form => ({
        valid: form.checkValidity(),
        controls: Array.from(form.elements).map(element => ({
          tag: element.tagName,
          name: element.getAttribute("name"),
          disabled: element.matches(":disabled"),
          value: (element as HTMLInputElement).value,
        })),
      }))).catch(() => []), null, 2),
      contentType: "application/json",
    }).catch(() => {});
    throw error;
  } finally {
    try { await reviewerContext.close(); }
    catch (error) {
      if (!primaryError) throw error;
      await testInfo.attach("reviewer-cleanup-error", { body: String(error), contentType: "text/plain" }).catch(() => {});
    }
  }
});
