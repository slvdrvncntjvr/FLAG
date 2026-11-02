import { expect, test, type Page, type APIResponse, type Locator } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { isolateOtpIp } from "./network";

test.use({ actionTimeout: 30_000 });
const diagnosticPath = (url: string) => new URL(url).pathname.replace(/\/invite\/[a-f0-9]{64}$/, "/invite/[capability]");

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  // This harness runs Next's dev compiler. Compile the pilot entries before
  // opening actors so first-use HMR cannot reload a page during an action's
  // redirect. These anonymous GETs create no fixture data or authorization.
  const id = "00000000-0000-0000-0000-000000000000";
  for (const path of [
    "/engagements", "/invite/continue", `/invite/${"0".repeat(64)}`,
    `/engagements/${id}/log`, `/logs/${id}`, `/logs/${id}/correction`, `/logs/${id}/update`,
    "/clients", `/clients/${id}`, "/moderation/logs", `/moderation/logs/${id}`,
    "/moderation/corrections", `/moderation/corrections/${id}`,
    `/api/logs/${id}/proofs`, `/api/revisions/${id}/proofs`,
    `/api/corrections/${id}/proofs`, `/api/moderation/proofs/${id}`,
  ]) {
    const response = await request.get(path, { maxRedirects: 0, timeout: 120_000 });
    expect([200, 303, 307, 404, 405]).toContain(response.status());
  }
  console.info("[Pilot review] Anonymous pilot routes compiled");
});

async function signIn(page: Page, email: string, role: "Freelancer" | "Client") {
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Pilot review escaped localhost");
    return route.fallback();
  });
  await isolateOtpIp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  let otp = "";
  await expect.poll(async () => {
    otp = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, "utf8"))[email] ?? "";
    return otp.length;
  }).toBe(6);
  await page.getByLabel("Code", { exact: true }).fill(otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Accept and continue", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function followLink(page: Page, link: Locator) {
  const href = await link.getAttribute("href");
  if (!href || new URL(href, page.url()).origin !== "http://localhost:3000") throw new Error("Local app link required");
  const requests: { method: string; path: string; status?: number; failure?: string }[] = [];
  const requested = (request: import("@playwright/test").Request) => { requests.push({ method: request.method(), path: diagnosticPath(request.url()) }); };
  const responded = (response: import("@playwright/test").Response) => { requests.push({ method: response.request().method(), path: diagnosticPath(response.url()), status: response.status() }); };
  const failed = (request: import("@playwright/test").Request) => { requests.push({ method: request.method(), path: diagnosticPath(request.url()), failure: request.failure()?.errorText }); };
  page.on("request", requested); page.on("response", responded); page.on("requestfailed", failed);
  try {
    await Promise.all([page.waitForURL(new URL(href, page.url()).href, { timeout: 60_000 }), link.click()]);
  } catch (error) {
    const report = test.info().outputPath("link-navigation.json");
    const body = JSON.stringify({ href, current: page.url(), anchor: await link.evaluate(node => ({ html: node.outerHTML, target: (node as HTMLAnchorElement).target, connected: node.isConnected })).catch(() => null), requests });
    await writeFile(report, body);
    await writeFile(resolve("../temporary", `pilot-link-${test.info().project.name}-${Date.now()}.json`), body);
    await test.info().attach("link-navigation", { contentType: "application/json", path: report });
    throw error;
  } finally { page.off("request", requested); page.off("response", responded); page.off("requestfailed", failed); }
}

// Only bootstrap staff/verification in the disposable harness. Every engagement,
// draft, proof, review, publication and correction below uses the actual UI.
async function bootstrap(email: string, role: "verified" | "moderator") {
  if (!/^pilot-review-[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("Synthetic actor required");
  const otpFile = process.env.E2E_OTP_FILE;
  if (!otpFile || basename(otpFile) !== "codes.json") throw new Error("Isolated harness required");
  const temp = resolve(dirname(otpFile));
  if (!basename(temp).startsWith("flag-e2e-")) throw new Error("Owned harness required");
  const app = join(temp, "app"), config = JSON.parse(await readFile(join(app, "wrangler.json"), "utf8"));
  if (config.name !== "flag-local-e2e" || config.d1_databases?.[0]?.database_name !== "flag-e2e") throw new Error("Disposable local DB required");
  const sql = role === "verified"
    ? `INSERT INTO freelancer_profile(user_id,display_name,status) SELECT id,'Synthetic Pilot Filer','verified' FROM user WHERE email='${email}'`
    : `UPDATE user SET role='moderator' WHERE email='${email}'`;
  const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "flag-e2e", "--local", "--persist-to", join(temp, "state"), "--command", sql], { cwd: app, encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (result.status !== 0) throw new Error("Synthetic staff setup failed; output withheld");
}

function privateResponse(response: APIResponse, status: number) {
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
}

async function uploadImage(page: Page, color: string) {
  const encoded = await page.evaluate(fill => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const context = canvas.getContext("2d")!; context.fillStyle = fill; context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL("image/png").split(",")[1];
  }, color);
  await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") });
  await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
  await expect(page.getByText("Private proof uploaded.", { exact: true })).toBeVisible();
}

async function claimAndView(page: Page, expectedProofs: number) {
  await page.getByRole("button", { name: "Claim for 30 minutes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review every proof", exact: true })).toBeVisible();
  const openButtons = page.getByRole("button", { name: "Open exact proof", exact: true });
  await expect(openButtons).toHaveCount(expectedProofs);
  const paths: string[] = [];
  for (let index = 0; index < expectedProofs; index++) {
    const response = page.waitForResponse(r => r.url().includes("/api/moderation/proofs/"));
    const popup = page.waitForEvent("popup");
    await openButtons.nth(index).click();
    const retrieved = await response;
    expect(retrieved.status()).toBe(200);
    expect(retrieved.headers()["cache-control"]).toContain("no-store");
    expect(retrieved.headers()["x-flag-proof-view"]).toBeTruthy();
    paths.push(new URL(retrieved.url()).pathname + new URL(retrieved.url()).search);
    await expect(page.getByRole("combobox", { name: "Your evidence verdict", exact: true }).nth(index)).toBeEnabled();
    await (await popup).close();
    await page.getByRole("combobox", { name: "Your evidence verdict", exact: true }).nth(index).selectOption("accept");
    await page.getByLabel("Private proof reason", { exact: true }).nth(index).fill("Synthetic evidence was viewed and supports the documented engagement and event.");
  }
  return paths;
}

async function decide(page: Page, decision: "approve" | "withdraw", reason: string) {
  await page.getByRole("combobox", { name: "Decision", exact: true }).selectOption(decision);
  await page.getByLabel("Private decision reason", { exact: true }).fill(reason);
  await page.getByRole("checkbox", { name: /^I personally viewed every proof/ }).check();
  await page.getByRole("button", { name: "Record human decision", exact: true }).click();
  await expect(page.getByText("This case is closed.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("pilot publication, record search and independent private correction withdrawal", async ({ page, browser }, info) => {
  test.setTimeout(480_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ baseURL: "http://localhost:3000", viewport: info.project.use.viewport })));
  const [client, reviewer, independent, outsider] = await Promise.all(contexts.map(context => context.newPage()));
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];
  const actionResponses: { actor: string; path: string; status: number; redirect: string | null }[] = [];
  const actionRequests: { actor: string; path: string; method: string; navigation: boolean; failed?: string }[] = [];
  for (const [label, target] of [["filer", page], ["client", client], ["reviewer", reviewer], ["independent", independent], ["reader", outsider]] as const) {
    target.on("pageerror", error => browserErrors.push(`${label}: ${error.message.replace(/https?:\/\/\S+/g, "[local URL]").slice(0, 1000)}`));
    target.on("console", message => { if (message.type() === "error") consoleErrors.push(`${label}: ${message.text().replace(/https?:\/\/\S+/g, "[local URL]").slice(0, 1000)}`); });
    target.on("response", response => { if (response.request().method() === "POST") actionResponses.push({ actor: label, path: diagnosticPath(response.url()), status: response.status(), redirect: response.headers()["x-action-redirect"] ?? null }); });
    target.on("request", request => { if (request.method() === "POST" || request.isNavigationRequest()) actionRequests.push({ actor: label, path: diagnosticPath(request.url()), method: request.method(), navigation: request.isNavigationRequest() }); });
    target.on("requestfailed", request => { actionRequests.push({ actor: label, path: diagnosticPath(request.url()), method: request.method(), navigation: request.isNavigationRequest(), failed: request.failure()?.errorText }); });
  }
  const ownerEmail = `pilot-review-owner-${stamp}@example.invalid`, clientName = `Synthetic pilot client ${stamp}`;
  const facts = "The synthetic project was delivered and the agreed invoice was paid one day after its due date.";
  const correctionNote = "Private synthetic counterproof establishes a factual error in the invoice association.";
  const correctionReason = "Private independent review confirms the invoice refers to another engagement; withdraw this publication.";
  try {
    await signIn(page, ownerEmail, "Freelancer");
    console.info("[Pilot review] Filer signed in");
    await bootstrap(ownerEmail, "verified");
    await page.goto("/engagements");
    await page.getByLabel("Engagement title", { exact: true }).fill(`Synthetic pilot engagement ${stamp}`);
    await page.getByLabel("Client name as you know it").fill(clientName);
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    await page.getByLabel("Start date", { exact: true }).fill(today);
    await page.getByRole("button", { name: "Create invitation", exact: true }).click();
    await expect(page.getByLabel("Invite link")).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
    const inviteUrl = await page.getByLabel("Invite link").inputValue();
    await signIn(client, `pilot-review-client-${stamp}@example.invalid`, "Client");
    console.info("[Pilot review] Client signed in");
    await client.goto(inviteUrl);
    await client.getByRole("button", { name: "Continue to sign in or respond", exact: true }).click();
    await expect(client).toHaveURL(/\/invite\/continue$/);
    await client.getByLabel("Display name", { exact: true }).fill(clientName);
    await client.getByLabel("City", { exact: true }).fill("Quezon City");
    for (const checkbox of await client.getByRole("checkbox").all()) await checkbox.check();
    const acceptButton = client.getByRole("button", { name: "Accept engagement", exact: true });
    await acceptButton.click();
    // Wait for the action's own redirect before further navigation. A hidden
    // form can be a transition and does not establish the action has settled.
    await expect(client).toHaveURL(/\/engagements\?response=accepted$/);
    await expect(client.getByText(/^Consent recorded/)).toBeVisible();
    console.info("[Pilot review] Engagement accepted with consent");
    await page.reload();
    await followLink(page, page.getByRole("link", { name: "Create private log", exact: true }));
    await page.getByLabel("Anchor event", { exact: true }).selectOption("completed");
    await page.getByLabel("Anchor date", { exact: true }).fill(today);
    await page.getByLabel("Work period start", { exact: true }).fill(today);
    await page.getByLabel("Work period end", { exact: true }).fill(today);
    await page.getByLabel("Rating", { exact: true }).selectOption("4");
    await page.getByLabel("Late Payment", { exact: true }).check();
    await page.getByLabel("Written facts", { exact: true }).fill(facts);
    await page.getByRole("button", { name: "Save complete draft", exact: true }).click();
    await expect(page).toHaveURL(/\/logs\/[a-zA-Z0-9_-]+$/);
    const logUrl = page.url();
    await uploadImage(page, "#345678");
    const proofLink = page.getByRole("link", { name: /^Download private proof 1 / });
    await expect(proofLink).toBeVisible();
    const proofPath = (await proofLink.getAttribute("href"))!;
    await page.getByRole("button", { name: "Submit private log", exact: true }).click();
    await expect(page.getByText("Status: Pending", { exact: true })).toBeVisible();
    console.info("[Pilot review] Initial log submitted with uploaded proof");
    await client.goto("/clients");
    await expect(client).toHaveURL(/\/clients\/[a-zA-Z0-9_-]+$/);
    const recordUrl = client.url();
    await expect(client.getByText("No published experiences in the past 12 months", { exact: false })).toBeVisible();

    const reviewerEmail = `pilot-review-reviewer-${stamp}@example.invalid`;
    await signIn(reviewer, reviewerEmail, "Client");
    await bootstrap(reviewerEmail, "moderator");
    await reviewer.goto("/moderation/logs");
    const logRef = (await page.locator("main p.font-mono").first().innerText()).trim();
    await followLink(reviewer, reviewer.getByRole("link", { name: `${logRef} · log`, exact: true }));
    await expect(reviewer).toHaveURL(/\/moderation\/logs\/[a-zA-Z0-9_-]+$/);
    await expect(reviewer.getByRole("heading", { name: "Engagement log review", exact: true })).toBeVisible();
    console.info("[Pilot review] Actual queue link opened review");
    const initialPaths = await claimAndView(reviewer, 1);
    await decide(reviewer, "approve", "The synthetic proof supports the named client, filing event and rating.");
    console.info("[Pilot review] Human proof review approved publication");
    await client.goto(recordUrl);
    await expect(client.getByText(facts, { exact: true })).toBeVisible();
    await expect(client.getByText("Limited record", { exact: true })).toBeVisible();
    await expect(client.getByRole("region", { name: "Record summary" })).toContainText("4.0 / 5 average rating");

    await signIn(outsider, `pilot-review-reader-${stamp}@example.invalid`, "Freelancer");
    await outsider.goto("/clients");
    await outsider.getByLabel("Client name", { exact: true }).fill(clientName);
    await outsider.getByRole("button", { name: "Search", exact: true }).click();
    await expect(outsider.getByRole("region", { name: "Matching clients" })).toContainText("1 accepted engagement");
    await followLink(outsider, outsider.getByRole("link", { name: clientName, exact: true }));
    await expect(outsider.getByText(facts, { exact: true })).toBeVisible();
    privateResponse(await outsider.request.get(proofPath), 404);
    privateResponse(await outsider.request.get(initialPaths[0]), 404);
    expect((await outsider.request.get(logUrl)).status()).toBe(404);

    await client.goto(`${logUrl}/correction`);
    await client.getByLabel("Private factual correction note", { exact: true }).fill(correctionNote);
    await client.getByRole("button", { name: "Open private correction draft", exact: true }).click();
    await expect(client.getByRole("heading", { name: "Request · draft", exact: true })).toBeVisible();
    await uploadImage(client, "#785634");
    const counterproof = client.getByRole("link", { name: /^Private counterproof 1:/ });
    await expect(counterproof).toBeVisible();
    const counterproofPath = (await counterproof.getAttribute("href"))!;
    await client.getByRole("button", { name: "Submit private correction", exact: true }).click();
    await expect(client.getByRole("heading", { name: "Request · submitted", exact: true })).toBeVisible();
    console.info("[Pilot review] Private correction submitted with counterproof");
    await outsider.reload();
    await expect(outsider.getByText(facts, { exact: true })).toBeVisible();
    await expect(outsider.getByText(correctionNote, { exact: true })).toHaveCount(0);
    const ordinaryHtml = await (await outsider.request.get(recordUrl)).text();
    expect(ordinaryHtml).not.toContain(correctionNote);
    expect(ordinaryHtml).not.toContain(counterproofPath);
    privateResponse(await outsider.request.get(counterproofPath), 404);
    expect((await outsider.request.get(`${logUrl}/correction`)).status()).toBe(404);
    // The original decider must not even discover the correction in their queue.
    await reviewer.goto("/moderation/corrections");
    await expect(reviewer.getByRole("link", { name: `${logRef} · correction`, exact: true })).toHaveCount(0);
    const independentEmail = `pilot-review-independent-${stamp}@example.invalid`;
    await signIn(independent, independentEmail, "Client");
    await bootstrap(independentEmail, "moderator");
    await independent.goto("/home");
    await followLink(independent, independent.getByRole("link", { name: /correction/i }));
    await expect(independent.getByRole("heading", { name: "Private correction queue", exact: true })).toBeVisible();
    await followLink(independent, independent.getByRole("link", { name: `${logRef} · correction`, exact: true }));
    const correctionUrl = independent.url();
    expect((await reviewer.request.get(correctionUrl)).status()).toBe(404);
    await expect(independent.getByText(correctionNote, { exact: true })).toBeVisible();
    const correctionPaths = await claimAndView(independent, 2);
    privateResponse(await outsider.request.get(correctionPaths[1]), 404);
    await decide(independent, "withdraw", correctionReason);
    console.info("[Pilot review] Independent human proof review withdrew publication");
    await outsider.goto(recordUrl);
    await expect(outsider.getByText("No published experiences in the past 12 months", { exact: false })).toBeVisible();
    await expect(outsider.getByText(facts, { exact: true })).toHaveCount(0);
    const withdrawnHtml = await (await outsider.request.get(recordUrl)).text();
    expect(withdrawnHtml).not.toContain(correctionNote);
    expect(withdrawnHtml).not.toContain(correctionReason);
    expect(withdrawnHtml).not.toContain(counterproofPath);
    await client.goto(`${logUrl}/correction`);
    await expect(client.getByText(correctionReason, { exact: true })).toBeVisible();
    privateResponse(await client.request.get(counterproofPath), 200);
    privateResponse(await outsider.request.get(counterproofPath), 404);
    expect(await outsider.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const anonymous = await browser.newContext({ baseURL: "http://localhost:3000" });
    try {
      privateResponse(await anonymous.request.get(proofPath), 404);
      privateResponse(await anonymous.request.get(counterproofPath), 404);
      expect((await anonymous.request.get(recordUrl, { maxRedirects: 0 })).status()).toBe(307);
    } finally { await anonymous.close(); }
  } catch (error) {
    const diagnostics = info.outputPath("navigation-diagnostics.json");
    const body = JSON.stringify({ browserErrors, consoleErrors, actionResponses, actionRequests }, null, 2);
    await writeFile(diagnostics, body);
    await writeFile(resolve("../temporary", `pilot-navigation-${stamp}.json`), body);
    await info.attach("navigation-diagnostics", { path: diagnostics, contentType: "application/json" });
    await info.attach("browser-errors", { body: JSON.stringify(browserErrors), contentType: "application/json" });
    await info.attach("console-errors", { body: JSON.stringify(consoleErrors), contentType: "application/json" });
    for (const [label, target] of [["client", client], ["reviewer", reviewer], ["independent", independent], ["reader", outsider]] as const) {
      await info.attach(`${label}-state`, { body: await target.locator("main").innerText({ timeout: 1000 }).catch(() => "Page unavailable"), contentType: "text/plain" });
    }
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
});
