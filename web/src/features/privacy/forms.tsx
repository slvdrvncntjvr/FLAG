"use client";
import { useActionState, type ReactNode } from "react";
import { privacyAction } from "./actions";

export function PrivacyForm({ operation, requestId, children, label }: { operation: string; requestId?: string; children?: ReactNode; label: string }) {
  const [state, action, pending] = useActionState(privacyAction, null);
  return <form action={action} className="register-panel register-staff-form my-5 space-y-4" aria-busy={pending}>
    <input type="hidden" name="operation" value={operation} />{requestId && <input type="hidden" name="requestId" value={requestId} />}
    {children}<button disabled={pending} className={operation === "record" || operation === "assess" || operation === "outcome" ? "register-primary" : "register-secondary"}>{pending ? "Saving…" : label}</button>
    {state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-accent" : "text-danger"}>{state.ok ? "message" in state ? state.message : "Saved." : state.error}</p>}
    {state?.ok && "token" in state && <div className="register-callout space-y-2 text-sm"><p>Deliver this secret only through the assessed private channel. It is shown once and must be sent in the Authorization header, never in a link or email.</p><p>Delivery: <code>{state.deliveryId}</code></p><p>One-use secret: <code className="break-all">{state.token}</code></p><p>Expires: {state.expiresAt}</p></div>}
  </form>;
}
