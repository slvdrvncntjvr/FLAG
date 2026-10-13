"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FREELANCER_STATEMENTS } from "@/lib/policies";
import type { Role } from "@/server/db/schema";
import { acceptPolicies } from "./actions";

const ACK_NAMES = ["ack_proof", "ack_not_legal", "ack_false_logs"] as const;

export function OnboardingForm({ role }: { role: Role | null }) {
  const [state, action, pending] = useActionState(acceptPolicies, null);
  const [chosen, setChosen] = useState<Role | null>(role);
  const errors: Record<string, string | undefined> = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="mt-6 space-y-8">
      {role === null && (
        <fieldset>
          <legend className="text-sm font-medium">Account type</legend>
          <p className="text-sm text-muted">This cannot be changed later.</p>
          {(["freelancer", "client"] as const).map((r) => (
            <label key={r} className="mt-2 flex items-start gap-3 border border-rule p-3">
              <input type="radio" name="role" value={r} required onChange={() => setChosen(r)} className="mt-1" />
              <span>
                <span className="block font-medium">{r === "freelancer" ? "Freelancer" : "Client"}</span>
                <span className="block text-sm text-muted">
                  {r === "freelancer"
                    ? "Read client records and, once verified, log your own engagements."
                    : "Accept engagements from freelancers you work with and see the record of your work."}
                </span>
              </span>
            </label>
          ))}
          {errors.role && <p className="mt-1 text-sm text-danger">{errors.role}</p>}
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Policies</legend>
        <Check name="privacy" error={errors.privacy}>
          I have read the{" "}
          <Link href="/legal/privacy" target="_blank" className="underline">
            privacy notice
          </Link>
          .
        </Check>
        <Check name="terms" error={errors.terms}>
          I accept the{" "}
          <Link href="/legal/terms" target="_blank" className="underline">
            terms
          </Link>
          .
        </Check>
      </fieldset>

      {chosen === "freelancer" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Freelancer statements</legend>
          {FREELANCER_STATEMENTS.map((text, i) => (
            <Check key={ACK_NAMES[i]} name={ACK_NAMES[i]} error={errors[ACK_NAMES[i]]}>
              {text}
            </Check>
          ))}
        </fieldset>
      )}

      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="sticky bottom-4 w-full rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60"
      >
        {pending ? "Saving" : "Accept and continue"}
      </button>
    </form>
  );
}

function Check({ name, error, children }: { name: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name={name} required className="mt-1 size-4" aria-invalid={error ? true : undefined} />
        <span className="text-sm">{children}</span>
      </label>
      {error && <p className="ml-7 text-sm text-danger">{error}</p>}
    </div>
  );
}
