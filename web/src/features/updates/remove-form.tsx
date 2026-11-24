"use client";
import { useActionState } from "react";
import { removeProposalProofAction } from "./actions";
export function RemoveProposalProof({ logId, proofId }: { logId: string; proofId: string }) {
  const [state, action, pending] = useActionState(removeProposalProofAction.bind(null, logId, proofId), null);
  return <form action={action} className="mt-2 space-y-2"><input type="hidden" name="logId" value={logId} /><input type="hidden" name="proofId" value={proofId} /><button disabled={pending} className="register-secondary text-sm">{pending ? "Removing…" : "Remove new proof"}</button>{state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? "Proof removed." : state.error}</p>}</form>;
}
