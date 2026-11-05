"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signOut();
      if (error) return setError("Could not sign out. Try again later.");
      router.replace("/");
    } catch {
      setError("Could not sign out. Try again later.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="underline underline-offset-2 disabled:opacity-60"
        onClick={signOut}
      >
        {pending ? "Signing out" : "Sign out"}
      </button>
      {error && <p role="alert" className="basis-full text-right text-sm text-danger">{error}</p>}
    </>
  );
}
