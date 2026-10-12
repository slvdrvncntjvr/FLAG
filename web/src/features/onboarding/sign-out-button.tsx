"use client";

import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/");
      }}
    >
      Sign out
    </button>
  );
}
