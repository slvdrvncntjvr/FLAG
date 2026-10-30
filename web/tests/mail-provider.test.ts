import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/server/mail";

const mail = { to: "recipient@example.invalid", subject: "Sign in", text: "Synthetic code 123456" };
const sender = "FLAG <sender@example.invalid>";
const resendEnv = { MAIL_FROM: sender, RESEND_API_KEY: "synthetic-resend-key" };

afterEach(() => vi.restoreAllMocks());

describe("PRD-F7 mail provider selection and safety", () => {
  it("sends via Resend when Brevo is unset, preserving the sender and message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"id":"synthetic-id"}'));
    await expect(sendMail(resendEnv, mail)).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.resend.com/emails", {
      method: "POST",
      signal: expect.any(AbortSignal),
      headers: { authorization: "Bearer synthetic-resend-key", "content-type": "application/json" },
      body: JSON.stringify({ from: sender, ...mail }),
    });
  });

  it.each([429, 500])("keeps Resend HTTP %i errors private without reading or logging response details", async status => {
    const privateBody = "PRIVATE synthetic-email@example.invalid OTP-123456 provider-key";
    const response = new Response(privateBody, { status });
    const text = vi.spyOn(response, "text");
    const json = vi.spyOn(response, "json");
    const logs = ["log", "info", "warn", "error", "debug"] as const;
    const logSpies = logs.map(level => vi.spyOn(console, level).mockImplementation(() => {}));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(sendMail(resendEnv, mail)).rejects.toEqual(new Error(`mail_failed:resend_${status}`));
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    for (const log of logSpies) expect(log).not.toHaveBeenCalled();
  });

  it.each(["brevo", "resend"] as const)("cancels a stalled %s request through its ten-second AbortSignal", async provider => {
    // Keep native timeout/abort behavior, shortening only the clock delay for this test.
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(0));
    let signal: AbortSignal | null | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (!signal) return reject(new Error("Missing cancellation signal"));
        const cancel = () => reject(signal!.reason);
        if (signal.aborted) cancel();
        else signal.addEventListener("abort", cancel, { once: true });
      });
    });
    const env = provider === "brevo" ? { ...resendEnv, BREVO_API_KEY: "synthetic-brevo-key" } : resendEnv;
    await expect(sendMail(env, mail)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([sender, " sender@example.invalid "])("prefers Brevo with sender %s even when Resend is configured", async from => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await expect(sendMail({ ...resendEnv, MAIL_FROM: from, BREVO_API_KEY: "synthetic-brevo-key" }, mail)).resolves.toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      sender: from === sender ? { name: "FLAG", email: "sender@example.invalid" } : { email: "sender@example.invalid" },
      to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text,
    });
  });

  it("does not fall back to Resend after a Brevo rejection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("synthetic private rejection", { status: 429 }));
    await expect(sendMail({ ...resendEnv, BREVO_API_KEY: "synthetic-brevo-key" }, mail)).rejects.toThrow("mail_failed:brevo_429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports sent:false without a network request when neither provider is configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(sendMail({ MAIL_FROM: sender }, mail)).resolves.toEqual({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
