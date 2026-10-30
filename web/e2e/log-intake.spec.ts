import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { isolateOtpIp } from "./network";

test.use({ actionTimeout: 30_000 });

async function signIn(page: Page, email: string, role: "Freelancer" | "Client") {
  await isolateOtpIp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  let code = "";
  await expect.poll(async () => {
    code = JSON.parse(await readFile(process.env.E2E_OTP_FILE!, "utf8"))[email] ?? "";
    return code.length;
  }).toBe(6);
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

// Narrow fixture mutations run only in this harness's disposable local DB.
async function fixture(email: string, kind: "verified" | "admin" | "client") {
  if (!/^log-intake-[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("Synthetic account required");
  const otp = process.env.E2E_OTP_FILE;
  if (!otp || basename(otp) !== "codes.json") throw new Error("Isolated harness required");
  const temp = resolve(dirname(otp));
  if (!basename(temp).startsWith("flag-e2e-")) throw new Error("Isolated harness path required");
  const config = JSON.parse(await readFile(join(temp, "app", "wrangler.json"), "utf8"));
  if (config.name !== "flag-local-e2e" || config.d1_databases?.[0]?.database_name !== "flag-e2e") throw new Error("Synthetic local database required");
  const sql = kind === "verified"
    ? `INSERT INTO freelancer_profile(user_id,display_name,status) SELECT id,'Synthetic Freelancer','verified' FROM user WHERE email='${email}'`
    : `UPDATE user SET role='${kind}' WHERE email='${email}'`;
  const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "flag-e2e", "--local", "--persist-to", join(temp, "state"), "--command", sql], { cwd: join(temp, "app"), encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (result.status !== 0) throw new Error("Synthetic fixture failed; output withheld");
}

function localOnly(page: Page) {
  return page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "localhost") throw new Error("Private intake test escaped localhost");
    return route.fallback();
  });
}

function metadataPng(original: Buffer) {
  const type = Buffer.from("tEXt"), data = Buffer.from("Comment\0synthetic-private-metadata-marker");
  const checksumInput = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of checksumInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([original.subarray(0, 33), length, type, data, checksum, original.subarray(33)]);
}

function syntheticPdf() {
  const objects = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>", "<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>"];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(value);
  value += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<</Size 4/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}

test("private intake draft, metadata-free proof, retry, denial and pending", async ({ page, browser }, info) => {
  test.setTimeout(300_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const owner = `log-intake-owner-${stamp}@example.invalid`;
  const clientContext = await browser.newContext({ baseURL: "http://localhost:3000", viewport: info.project.use.viewport });
  const outsiderContext = await browser.newContext({ baseURL: "http://localhost:3000", viewport: info.project.use.viewport });
  const client = await clientContext.newPage(), outsider = await outsiderContext.newPage();
  await Promise.all([localOnly(page), localOnly(client), localOnly(outsider)]);
  for (const [label, target] of [["owner", page], ["client", client]] as const) {
    target.on("pageerror", () => console.info(`[F2 ${label}] browser script error (details withheld)`));
    target.on("response", response => { if (response.request().method() === "POST") console.info(`[F2 ${label}] POST HTTP ${response.status()}, action redirect ${!!response.headers()["x-action-redirect"]}`); });
  }
  try {
    console.info("[F2] synthetic accounts and accepted engagement setup");
    await signIn(page, owner, "Freelancer");
    await fixture(owner, "verified");
    await page.goto("/engagements");
    await page.getByLabel("Engagement title", { exact: true }).fill("Synthetic private intake work");
    await page.getByLabel("Client name as you know it").fill("Synthetic client");
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    await page.getByLabel("Start date", { exact: true }).fill(today);
    await page.getByRole("button", { name: "Create invitation", exact: true }).click();
    const invite = page.getByLabel("Invite link");
    await expect(invite).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
    const inviteUrl = await invite.inputValue();
    await signIn(client, `log-intake-client-${stamp}@example.invalid`, "Client");
    await client.goto(inviteUrl);
    await client.getByRole("button", { name: "Continue to sign in or respond" }).click();
    await client.getByLabel("Display name", { exact: true }).fill("Synthetic named client");
    for (const box of await client.getByRole("checkbox").all()) await box.check();
    const accepted = client.waitForResponse(response => response.request().method() === "POST" && !!response.request().headers()["next-action"]);
    await client.getByRole("button", { name: "Accept engagement", exact: true }).click();
    await accepted;
    // Intake setup verifies the durable receipt on the destination. Invite
    // redirect behavior has its own engagements.spec.ts regression gate.
    await client.goto("/engagements");
    await expect(client.getByText(/^Consent recorded/)).toBeVisible();
    console.info("[F2] creating complete draft");
    await page.reload();
    await page.getByRole("link", { name: "Create private log", exact: true }).click();
    await expect(page).toHaveURL(/\/engagements\/[a-zA-Z0-9_-]+\/log$/);
    const createUrl = page.url();
    await page.getByLabel("Anchor event", { exact: true }).selectOption("completed");
    await page.getByLabel("Anchor date", { exact: true }).fill(today);
    await page.getByLabel("Work period start", { exact: true }).fill(today);
    await page.getByLabel("Work period end", { exact: true }).fill(today);
    await page.getByLabel("Rating", { exact: true }).selectOption("4");
    await page.getByLabel("Late Payment", { exact: true }).check();
    await page.getByLabel("Written facts", { exact: true }).fill("Synthetic work was completed and the agreed payment arrived one day later than planned.");
    await page.getByLabel("Amount in centavos (optional)", { exact: true }).fill("10000");
    // Hidden values select no authority and cannot retarget the signed action.
    await page.locator('input[name="engagementId"]').evaluate(input => { (input as HTMLInputElement).value = "unrelated-engagement"; });
    await page.getByRole("button", { name: "Save complete draft", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toContainText("Check the supplied fields");
    expect(page.url()).toBe(createUrl);
    await page.reload();
    await page.getByLabel("Anchor event", { exact: true }).selectOption("completed");
    await page.getByLabel("Anchor date", { exact: true }).fill(today);
    await page.getByLabel("Work period start", { exact: true }).fill(today);
    await page.getByLabel("Work period end", { exact: true }).fill(today);
    await page.getByLabel("Rating", { exact: true }).selectOption("4");
    await page.getByLabel("Late Payment", { exact: true }).check();
    const facts = "Synthetic work was completed and the agreed payment arrived one day later than planned.";
    await page.getByLabel("Written facts", { exact: true }).fill(facts);
    await page.getByLabel("Amount in centavos (optional)", { exact: true }).fill("10000");
    await page.getByRole("button", { name: "Save complete draft", exact: true }).click();
    await expect(page).toHaveURL(/\/logs\/[a-zA-Z0-9_-]+$/);
    const logUrl = page.url();
    console.info("[F2] editing draft and preparing proof");
    await expect(page.getByRole("button", { name: "Submit private log", exact: true })).toBeDisabled();
    await expect(page.getByText(/Positive — derived/)).toBeVisible();
    await page.getByLabel("Written facts", { exact: true }).fill(`${facts} The final deliverables were accepted.`);
    await page.getByRole("button", { name: "Save complete draft", exact: true }).click();
    await expect(page.getByText("Draft saved. Review or add proof, then submit.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Written facts", { exact: true })).toHaveValue(`${facts} The final deliverables were accepted.`);
    await page.getByText("Using Messenger? Open in Chrome", { exact: true }).click();
    await expect(page.getByText(/Choose Chrome on Android or Safari on iPhone/)).toBeVisible();
    const images = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 4;
      const context = canvas.getContext("2d")!; context.fillStyle = "#345678"; context.fillRect(0, 0, 4, 4);
      return ["image/png", "image/jpeg", "image/webp"].map(type => ({ type, data: canvas.toDataURL(type).split(",")[1] }));
    });
    let uploadRequests = 0;
    await page.route("**/api/logs/*/proofs", async route => {
      uploadRequests++;
      const bytes = route.request().postDataBuffer()!;
      expect(bytes.includes(Buffer.from("synthetic-private-metadata-marker"))).toBe(false);
      if (uploadRequests === 1) return route.fulfill({ status: 503, json: { ok: false } });
      return route.fallback();
    });
    const png = metadataPng(Buffer.from(images[0].data, "base64"));
    expect(png.includes(Buffer.from("synthetic-private-metadata-marker"))).toBe(true);
    await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "metadata.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
    await expect(page.locator("main [role=alert]")).toContainText("Proof could not be uploaded");
    await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved proof (1/5)", exact: true })).toBeVisible();
    const proofLink = page.getByRole("link", { name: /^Download private proof 1 / });
    let proofPath = (await proofLink.getAttribute("href"))!;
    console.info("[F2] private download and four accepted MIME types");
    const downloaded = await page.request.get(proofPath);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()["cache-control"]).toContain("no-store");
    expect(downloaded.headers()["content-disposition"]).toContain("attachment");
    expect(downloaded.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await downloaded.body()).includes(Buffer.from("synthetic-private-metadata-marker"))).toBe(false);
    await page.getByRole("button", { name: "Remove proof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved proof (0/5)", exact: true })).toBeVisible();
    expect((await page.request.get(proofPath)).status()).toBe(404);
    // A mislabeled image must still pass through canvas, never the PDF path.
    await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "replacement.pdf", mimeType: "application/pdf", buffer: png });
    await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved proof (1/5)", exact: true })).toBeVisible();
    proofPath = (await proofLink.getAttribute("href"))!;
    for (const [index, image] of images.slice(1).entries()) {
      await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "synthetic", mimeType: image.type, buffer: Buffer.from(image.data, "base64") });
      await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
      await expect(page.getByRole("heading", { name: `Saved proof (${index + 2}/5)`, exact: true })).toBeVisible();
    }
    await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "synthetic.pdf", mimeType: "application/pdf", buffer: syntheticPdf() });
    await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved proof (4/5)", exact: true })).toBeVisible();
    await page.getByLabel("Proof file", { exact: true }).setInputFiles({ name: "fifth.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Upload private proof", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved proof (5/5)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload private proof", exact: true })).toBeDisabled();
    const uploadPath = new URL(logUrl).pathname.replace("/logs/", "/api/logs/") + "/proofs";
    const sixth = await page.request.post(uploadPath, { headers: { origin: "http://localhost:3000" }, multipart: { kind: "other", file: { name: "sixth.png", mimeType: "image/png", buffer: png } } });
    expect(sixth.status()).toBe(409);
    await client.goto(logUrl);
    console.info("[F2] relationship and bare-admin denials");
    await expect(client.getByRole("heading", { name: "Private engagement log", exact: true })).toBeVisible();
    await expect(client.getByRole("button", { name: "Save complete draft", exact: true })).toHaveCount(0);
    expect((await client.request.get(proofPath)).status()).toBe(200);
    expect((await client.request.get(createUrl)).status()).toBe(404);
    await signIn(outsider, `log-intake-outsider-${stamp}@example.invalid`, "Client");
    expect((await outsider.request.get(logUrl)).status()).toBe(404);
    expect((await outsider.request.get(proofPath)).status()).toBe(404);
    await fixture(`log-intake-outsider-${stamp}@example.invalid`, "admin");
    expect((await outsider.request.get(logUrl)).status()).toBe(404);
    expect((await outsider.request.get(proofPath)).status()).toBe(404);
    const anonymous = await browser.newContext({ baseURL: "http://localhost:3000" });
    try { expect((await anonymous.request.get(proofPath)).status()).toBe(404); } finally { await anonymous.close(); }
    await page.getByLabel("Written facts", { exact: true }).fill(`${facts} Unsaved change.`);
    await expect(page.getByRole("button", { name: "Submit private log", exact: true })).toBeDisabled();
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Submit private log", exact: true }).click();
    console.info("[F2] submitted; checking frozen pending view");
    await expect(page.getByText("Submitted. Awaiting log moderation.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save complete draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload private proof", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Status: Pending", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("private-pending.png"), fullPage: true });
    await client.goto("/engagements");
    await client.getByRole("link", { name: "View private log", exact: true }).click();
    await expect(client.getByText("Status: Pending", { exact: true })).toBeVisible();
  } finally { await clientContext.close(); await outsiderContext.close(); }
});
