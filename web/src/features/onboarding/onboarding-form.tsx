"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { RegisterIcon } from "@/components/register-icon";
import { FREELANCER_STATEMENTS } from "@/lib/policies";
import type { Role } from "@/server/db/schema";
import { acceptPolicies } from "./actions";
import { INVITE_RETURN_PATH, inviteReturnPath } from "@/lib/invite-return";

const ACK_NAMES = ["ack_proof", "ack_not_legal", "ack_false_logs"] as const;

export function OnboardingForm({ role, returnTo }: { role: Role | null; returnTo?: string }) {
  const [state, action, pending] = useActionState(acceptPolicies, null);
  const destination = inviteReturnPath(returnTo);
  const initialRole = role ?? (destination === INVITE_RETURN_PATH ? "client" : null);
  const [chosen, setChosen] = useState<Role | null>(initialRole);
  const errors: Record<string, string | undefined> = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="mt-5 space-y-5">
      <input type="hidden" name="returnTo" value={destination} />
      {role === null && (
        <fieldset>
          <legend className="sr-only">Account type</legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {(["freelancer", "client"] as const).map((r) => (
              <label key={r} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_1rem] content-start gap-y-2 rounded-lg border border-rule bg-surface p-3 has-checked:border-accent has-checked:bg-tint has-checked:ring-1 has-checked:ring-accent hover:border-accent sm:p-4">
                <input
                  type="radio" name="role" value={r} required defaultChecked={initialRole === r} onChange={() => setChosen(r)}
                  className="col-start-2 row-start-1 size-4 self-center justify-self-end"
                />
                <span className="register-icon-tile col-start-1 row-start-1">
                  <RegisterIcon name={r === "freelancer" ? "engagements" : "record"} />
                </span>
                <span className="col-span-full text-sm font-semibold">{r === "freelancer" ? "Freelancer" : "Client"}</span>
                <span className="col-span-full text-xs leading-relaxed text-muted">
                  {r === "freelancer"
                    ? "Read client records and, once verified, log your own engagements."
                    : "Accept engagements from freelancers you work with and see the record of your work."}
                </span>
              </label>
            ))}
          </div>
          {errors.role && <p className="mt-1 text-sm text-danger">{errors.role}</p>}
        </fieldset>
      )}

      <fieldset className="space-y-2 border-t border-rule pt-3">
        <legend className="sr-only">Policies</legend>
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
        className="register-primary w-full"
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
        <input type="checkbox" name={name} required className="mt-0.5 size-4 shrink-0" aria-invalid={error ? true : undefined} />
        <span className="text-sm">{children}</span>
      </label>
      {error && <p className="ml-7 text-sm text-danger">{error}</p>}
    </div>
  );
}
