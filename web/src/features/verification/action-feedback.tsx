"use client";

import { useRouter } from "next/navigation";
import type { ReviewResult } from "./schema";

export const inputStyle = "mt-1 block min-w-0 w-full rounded-sm border border-rule bg-paper px-3 py-3 text-base";
export const buttonStyle = "rounded-sm bg-ink px-4 py-3 text-paper disabled:opacity-60";

export async function recoverAction(action: (previous: ReviewResult | null, form: FormData) => Promise<ReviewResult>, previous: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  try { return await action(previous, form); }
  catch {
    return { ok: false, code: "unavailable", message: "Could not confirm the change. Reload status before trying again." };
  }
}

export function ReloadStatus() {
  const router = useRouter();
  return <button type="button" className="min-h-11 underline underline-offset-2" onClick={() => router.refresh()}>Reload status</button>;
}

export function ActionFeedback({ state, success }: { state: ReviewResult | null; success: string }) {
  if (!state) return null;
  return state.ok ? <p role="status">{success}</p> : (
    <div className="space-y-2">
      <p role="alert" className="text-danger">{state.message}</p>
      <ReloadStatus />
    </div>
  );
}

export function ReadFailure() {
  return <div className="mt-6 space-y-2"><p role="alert">Could not load this record. Reload to try again.</p><ReloadStatus /></div>;
}
