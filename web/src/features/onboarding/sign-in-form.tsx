"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { authClient } from "./auth-client";
import { inviteAuthPath } from "@/lib/invite-return";

const subscribe = () => () => {};

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sendDisabled = !hydrated || pending;
  const stepInput = useRef<HTMLInputElement>(null);
  const focusNextStep = useRef(false);

  useEffect(() => {
    if (!focusNextStep.current) return;
    stepInput.current?.focus();
    focusNextStep.current = false;
  }, [step]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (sendDisabled) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
      if (error) return setError(error.status === 429 ? "Too many attempts. Try again after fifteen minutes." : "Could not send the code. Try again later.");
      focusNextStep.current = true;
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
      <input ref={stepInput} id="email" type="email" required autoComplete="email" value={email} disabled={sendDisabled}
        placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} className="register-field mt-1 block w-full" />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={sendDisabled} className="register-primary mt-6 w-full">{pending ? "Sending" : "Send code"}</button>
    </form>
  ) : (
    <form key="code" onSubmit={verify} className="mt-6">
      <p id="otp-status" role="status" className="register-callout mb-4 text-sm">
        A 6-digit code was sent to <strong>{email}</strong>. It expires in 10 minutes.
      </p>
      <label htmlFor="otp" className="block text-sm font-medium">Code</label>
      <input ref={stepInput} id="otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
        autoComplete="one-time-code" aria-describedby="otp-status"
        className="register-field mt-1 block w-full font-mono tracking-[0.4em]" />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className="register-primary mt-5 w-full">{pending ? "Checking" : "Sign in"}</button>
      <button type="button" disabled={pending} onClick={() => { setError(null); focusNextStep.current = true; setStep("email"); }}
        className="mt-2 min-h-11 text-left text-sm font-medium text-accent underline underline-offset-4 disabled:opacity-60">
        Use a different email or send a new code
      </button>
    </form>
  );
}
