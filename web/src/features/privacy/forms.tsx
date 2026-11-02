"use client";
import { useActionState, type ReactNode } from "react";
import { privacyAction } from "./actions";

export function PrivacyForm({ operation, requestId, children, label }: { operation: string; requestId?: string; children?: ReactNode; label: string }) {
  const [state, action, pending] = useActionState(privacyAction, null);
  return <form action={action} className="my-6 space-y-4 rounded border border-rule p-4" aria-busy={pending}>
    <input type="hidden" name="operation" value={operation} />{requestId && <input type="hidden" name="requestId" value={requestId} />}
    {children}<button disabled={pending} className="min-h-11 rounded bg-ink px-4 py-2 text-paper">{pending ? "Saving…" : label}</button>
    {state && <p role={state.ok ? "status" : "alert"}>{state.ok ? "message" in state ? state.message : "Saved." : state.error}</p>}
    {state?.ok && "token" in state && <div className="space-y-2"><p>Deliver this secret only through the assessed private channel. It is shown once and must be sent in the Authorization header, never in a link or email.</p><p>Delivery: <code>{state.deliveryId}</code></p><p>One-use secret: <code className="break-all">{state.token}</code></p><p>Expires: {state.expiresAt}</p></div>}
  </form>;
}
