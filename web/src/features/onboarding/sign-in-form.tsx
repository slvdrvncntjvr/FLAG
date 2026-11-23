"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "./auth-client";
import { inviteAuthPath } from "@/lib/invite-return";

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
      if (error) return setError(error.status === 429 ? "Too many attempts. Try again after fifteen minutes." : "Could not send the code. Try again later.");
      setStep("code");
    } catch {
      setError("Could not send the code. Try again later.");
    } finally {
      setPending(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const otp = String(new FormData(e.currentTarget).get("otp") ?? "").replace(/\D/g, "");
    if (otp.length !== 6) return setError("Enter the 6-digit code.");
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp });
      if (error)
        return setError(
          error.status === 429 ? "Too many attempts. Try again after fifteen minutes."
            : error.status < 500 && (error.code === "INVALID_OTP" || error.code === "OTP_EXPIRED")
              ? "Code is incorrect or expired."
              : "Could not check the code. Try again later.",
        );
      router.replace(inviteAuthPath("onboarding", returnTo));
    } catch {
      setError("Could not check the code. Try again later.");
    } finally {
      setPending(false);
    }
  }

  return step === "email" ? (
    <form key="email" onSubmit={sendCode} className="mt-6">
      <label htmlFor="email" className="text-sm font-medium">Email</label>
      <input id="email" type="email" required autoComplete="email" value={email}
        placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} className="register-field mt-1 block w-full" />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className="register-primary mt-6 w-full">{pending ? "Sending" : "Send code"}</button>
    </form>
  ) : (
    <form key="code" onSubmit={verify} className="mt-6">
      <label htmlFor="otp" className="block text-sm font-medium">Code</label>
      <input id="otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
        autoComplete="one-time-code" aria-describedby="otp-status"
        className="register-field mt-1 block w-full border-2! border-ink! font-mono tracking-[0.4em]" />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={pending} onClick={() => { setError(null); setStep("email"); }}
        className="register-secondary mx-auto mt-5 flex! w-fit max-w-full text-sm shadow-[0_3px_0_var(--ink)]">
        Use a different email or send a new code (replaces the current one)
      </button>
      <p id="otp-status" role="status" className="mt-6 rounded-sm bg-ink px-4 py-3.5 text-sm text-paper">
        A 6-digit code was sent to <span className="font-mono">{email}</span>. It expires in 10 minutes.
      </p>
      <button type="submit" disabled={pending} className="register-primary mt-5 w-full">{pending ? "Checking" : "Sign in"}</button>
    </form>
  );
}
