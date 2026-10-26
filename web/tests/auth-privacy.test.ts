import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createAuth } from "@/server/auth/config";
import { account, freelancerProfile, session, user, verificationCase } from "@/server/db/schema";
import { BASE, setup } from "./helpers";

// Synthetic payloads only. These reach supported Better Auth fields, not the F1 form.
const unsafeNames = [
  "1234-5678-9012-3456", "1234567890123456", "１２３４－５６７８－９０１２－３４５６",
  "1234\u200b5678\u200b9012\u200b3456", Array.from("1234567890123456").join("\u20dd"),
  "%31%32%33%34%2F%35%36%37%38%2F%39%30%31%32%2F%33%34%35%36",
  'qrBody={"PCN":"synthetic-sensitive-value"}', "passportNumber=PABCDEF",
  "data:image/png;base64,iVBORw0KGgo=", "iVBORw0KGgo=", "idHash=" + "a".repeat(64),
];
const unsafeImages = [
  "data:image/png;base64,iVBORw0KGgo=", "data:image/jpeg;base64,/9j/synthetic",
  "DATA:image/svg+xml,%3Csvg%3E", "%64%61%74%61%3Aimage/png;base64,synthetic",
  "iVBORw0KGgo=", "/9j/synthetic", "blob:https://example.invalid/synthetic",
];
const discardedImages = [
  "https://example.invalid/picture?content=data:image/png;base64,iVBORw0KGgo=",
  "https://example.invalid/picture#blob:https://example.invalid/private",
  "https://example.invalid/picture?content=%2564%2561%2574%2561%253Aimage/png%253Bbase64%252Csynthetic",
  "https://example.invalid/picture#%2F9j%2Fsynthetic",
  "https://example.invalid/picture?content=qrBody%3Dsynthetic",
  "https://example.invalid/picture?content=%252525252564",
  "https://example.invalid/picture#d\ta\nt\ra:image/png,synthetic",
];
const unsafeFields = [
  ...unsafeNames.map(name => ({ name })), ...unsafeImages.map(image => ({ image })),
];
const userByEmail = (db: ReturnType<typeof setup>["db"], email: string) => db.query.user.findFirst({ where: eq(user.email, email) });
const userById = (db: ReturnType<typeof setup>["db"], id: string) => db.query.user.findFirst({ where: eq(user.id, id) });

describe("PRD-F7/F8 INV-3 standard authentication writes", () => {
  it.each(unsafeFields.map((fields, index) => ({ fields, index })))(
    "OTP signup rejects sensitive supported fields before user/session creation ($index)", async ({ fields, index }) => {
      const f = setup(), email = `privacy-signup-${index}@example.invalid`;
      const result = await f.signIn(email, fields);
      expect(result.res.status).toBe(400);
      expect(await result.res.json()).toMatchObject({ code: "INVALID_USER_PROFILE" });
      expect(result.cookie).toBe("");
      expect(await userByEmail(f.db, email)).toBeUndefined();
      expect(await f.db.select().from(session)).toEqual([]);
      expect(await f.db.select().from(account)).toEqual([]);
    },
  );

  it.each((["pending", "verified"] as const).flatMap(status => unsafeFields.map((fields, index) => ({ status, fields, index }))))(
    "same-origin update-user rejects sensitive fields for $status freelancer without mutation ($index)", async ({ status, fields }) => {
      const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
      const signed = await f.signIn(email, { name: "María O’Connor / Studio 7" });
      expect(signed.res.status).toBe(200);
      const id = signed.userId!;
      await f.db.update(user).set({ role: "freelancer" }).where(eq(user.id, id));
      await f.db.insert(freelancerProfile).values({ userId: id, displayName: "María O’Connor / Studio 7", status });
      if (status === "pending") await f.db.insert(verificationCase).values({ id: crypto.randomUUID(), freelancerId: id });
      const before = await userById(f.db, id);
      const profile = await f.db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, id) });
      const sessions = await f.db.select().from(session).where(eq(session.userId, id));
      const requests = await f.db.select().from(verificationCase).where(eq(verificationCase.freelancerId, id));
      const response = await f.post("/update-user", { name: "Safe replacement", ...fields }, signed.cookie);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_USER_PROFILE" });
      expect(await userById(f.db, id)).toEqual(before);
      expect(await f.db.query.freelancerProfile.findFirst({ where: eq(freelancerProfile.userId, id) })).toEqual(profile);
      expect(await f.db.select().from(session).where(eq(session.userId, id))).toEqual(sessions);
      expect(await f.db.select().from(verificationCase).where(eq(verificationCase.freelancerId, id))).toEqual(requests);
    },
  );

  it.each([{ name: 1234567890123456 }, { name: { idNumber: "synthetic" } }, { image: 1234567890123456 }, { image: { data: "synthetic" } }])(
    "rejects non-string core profile values before the adapter", async fields => {
      const f = setup(), signed = await f.signIn(`${crypto.randomUUID()}@example.invalid`, { name: "Alex Rivera" });
      const before = await userById(f.db, signed.userId!);
      expect((await f.post("/update-user", fields, signed.cookie)).status).toBe(400);
      expect(await userById(f.db, signed.userId!)).toEqual(before);
    },
  );

  it("preserves empty OTP names, numeric email localparts, normal names, role protection and repeat sign-in while discarding images", async () => {
    const f = setup(), email = "1234567890123456@example.invalid";
    const first = await f.signIn(email);
    expect(first.res.status).toBe(200);
    expect(await userByEmail(f.db, email)).toMatchObject({ name: "", email, image: null, role: null });
    const image = "https://lh3.googleusercontent.com/a/12345678901234567890=s96-c";
    expect((await f.post("/update-user", { name: "María O’Connor / Studio 7", image }, first.cookie)).status).toBe(200);
    expect(await userByEmail(f.db, email)).toMatchObject({ name: "María O’Connor / Studio 7", image: null, role: null });
    expect((await f.post("/update-user", { name: "Alex Rivera", image: null }, first.cookie)).status).toBe(200);
    expect((await f.post("/update-user", { name: "Alex Rivera", role: "admin" }, first.cookie)).status).toBe(400);
    expect((await f.signIn(email, { name: "Ignored existing-account name" })).res.status).toBe(200);
    expect(await userByEmail(f.db, email)).toMatchObject({ name: "Alex Rivera", image: null, role: null });
  });

  it.each(discardedImages.map((image, index) => ({ image, index })))(
    "discards whole HTTP image URLs with hidden payloads before signup/update persistence ($index)", async ({ image, index }) => {
      const f = setup(), email = `${crypto.randomUUID()}@example.invalid`;
      const signed = await f.signIn(email, { name: "Alex Rivera", image });
      expect(signed.res.status).toBe(200);
      expect(await signed.res.json()).toMatchObject({ user: { image: null } });
      const id = signed.userId!;
      await f.db.update(user).set({ role: "freelancer" }).where(eq(user.id, id));
      const status = index % 2 ? "verified" : "pending";
      await f.db.insert(freelancerProfile).values({ userId: id, displayName: "Alex Rivera", status });
      if (status === "pending") await f.db.insert(verificationCase).values({ id: crypto.randomUUID(), freelancerId: id });
      const before = await userById(f.db, id);
      expect(before).toMatchObject({ image: null, name: "Alex Rivera" });
      expect((await f.post("/update-user", { image }, signed.cookie)).status).toBe(200);
      expect(await userById(f.db, id)).toMatchObject({ image: null, name: "Alex Rivera" });
      const current = await f.auth.api.getSession({ headers: new Headers({ cookie: signed.cookie }) });
      expect(current?.user.image).toBeNull();
      expect(current?.user.name).toBe("Alex Rivera");
      expect(JSON.stringify(await userById(f.db, id))).not.toContain(image);
    },
  );

  it("uses a generic response and never logs rejected content", async () => {
    const f = setup(), signed = await f.signIn("privacy-logging@example.invalid", { name: "Alex Rivera" });
    const spies = ["error", "warn", "info", "log"].map(method => vi.spyOn(console, method as "error").mockImplementation(() => {}));
    try {
      for (const fields of [{ name: "passportNumber=SYNTHETIC_PRIVATE_MARKER" }, { image: unsafeImages[0] }]) {
        const response = await f.post("/update-user", fields, signed.cookie);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ code: "INVALID_USER_PROFILE", message: "Check the supplied profile fields. Do not include ID details or files." });
        expect(JSON.stringify(spies.flatMap(spy => spy.mock.calls))).not.toContain(Object.values(fields)[0]);
      }
      expect((await f.post("/update-user", { image: discardedImages[0] }, signed.cookie)).status).toBe(200);
      expect(JSON.stringify(spies.flatMap(spy => spy.mock.calls))).not.toContain(discardedImages[0]);
    } finally {
      spies.forEach(spy => spy.mockRestore());
    }
  });

  it("configured Google provisioning and provider adapter updates share the same pre-write guard", async () => {
    const f = setup();
    const auth = createAuth({
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", BETTER_AUTH_URL: BASE, MAIL_FROM: "test@example.invalid",
      GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
    }, f.db, { sendOtp: async () => {} });
    const ctx = await auth.$context;
    expect(ctx.socialProviders.map(provider => provider.id)).toContain("google");
    // These are the installed OAuth implementation's internal-adapter seams;
    // no network/provider token or invented hook invocation is used.
    for (const fields of [{ name: unsafeNames[0] }, { image: unsafeImages[0] }]) {
      const email = `${crypto.randomUUID()}@example.invalid`;
      await expect(ctx.internalAdapter.createOAuthUser(
        { email, name: "Alex Rivera", emailVerified: true, ...fields },
        { providerId: "google", accountId: crypto.randomUUID() },
      )).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect(await userByEmail(f.db, email)).toBeUndefined();
      await expect(ctx.internalAdapter.createUser(
        { email, name: "Alex Rivera", emailVerified: true, ...fields }, { method: "oauth", oauth: { providerId: "google" } },
      )).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect(await userByEmail(f.db, email)).toBeUndefined();
    }
    expect(await f.db.select().from(account)).toEqual([]);
    const email = "provider-safe@example.invalid", image = "https://lh3.googleusercontent.com/a/12345678901234567890=s96-c";
    const provisioned = await ctx.internalAdapter.createOAuthUser(
      { email, name: "Alex Rivera", emailVerified: true, image },
      { providerId: "google", accountId: "synthetic-provider-subject" },
    );
    expect(provisioned.user.image).toBeNull();
    const before = await userByEmail(f.db, email);
    for (const fields of [{ name: unsafeNames[1] }, { image: unsafeImages[1] }]) {
      await expect(ctx.internalAdapter.updateUser(provisioned.user.id, fields)).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect(await userByEmail(f.db, email)).toEqual(before);
      await expect(ctx.internalAdapter.updateUserByEmail(email, fields)).rejects.toMatchObject({ status: "BAD_REQUEST" });
      expect(await userByEmail(f.db, email)).toEqual(before);
    }
    await ctx.internalAdapter.updateUser(provisioned.user.id, { name: "María O’Connor", image: null });
    expect(await userByEmail(f.db, email)).toMatchObject({ name: "María O’Connor", image: null, role: null });
    const updated = await ctx.internalAdapter.updateUser(provisioned.user.id, { image });
    expect(updated?.image).toBeNull();
    expect(await userByEmail(f.db, email)).toMatchObject({ image: null });
    expect((await ctx.internalAdapter.updateUserByEmail(email, { image }))?.image).toBeNull();
  });
});
