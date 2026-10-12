"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "./auth-client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setPending(false);
    if (error) return setError(error.status === 429 ? "Too many attempts. Wait a minute." : "Could not send the code.");
    setStep("code");
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const otp = String(new FormData(e.currentTarget).get("otp") ?? "");
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    setPending(false);
    if (error) return setError("Code is incorrect or expired.");
    router.replace("/onboarding");
  }

  const field = "mt-1 block w-full rounded-sm border border-rule bg-white px-3 py-3";
  const button = "mt-6 w-full rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60";

  return step === "email" ? (
    <form onSubmit={sendCode} className="mt-6">
      <label htmlFor="email" className="text-sm font-medium">Email</label>
      <input id="email" type="email" required autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} className={field} />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className={button}>{pending ? "Sending" : "Send code"}</button>
    </form>
  ) : (
    <form onSubmit={verify} className="mt-6">
      <p className="text-sm">A 6-digit code was sent to <span className="font-mono">{email}</span>. It expires in 10 minutes.</p>
      <label htmlFor="otp" className="mt-4 block text-sm font-medium">Code</label>
      <input id="otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
        autoComplete="one-time-code" className={`${field} font-mono tracking-widest`} />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className={button}>{pending ? "Checking" : "Sign in"}</button>
      <button type="button" onClick={() => setStep("email")} className="mt-3 w-full py-2 text-sm underline">
        Use a different email or send a new code
      </button>
    </form>
  );
}
