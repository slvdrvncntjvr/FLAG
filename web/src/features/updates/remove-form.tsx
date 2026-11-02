"use client";
import { useActionState } from "react";
import { removeProposalProofAction } from "./actions";
export function RemoveProposalProof({ logId, proofId }: { logId: string; proofId: string }) {
  const [state, action, pending] = useActionState(removeProposalProofAction.bind(null, logId, proofId), null);
  return <form action={action} className="my-2"><input type="hidden" name="logId" value={logId} /><input type="hidden" name="proofId" value={proofId} /><button disabled={pending} className="min-h-11 border border-rule px-4 py-3 disabled:opacity-60">{pending ? "Removing…" : "Remove new proof"}</button>{state && <p role={state.ok ? "status" : "alert"}>{state.ok ? "Proof removed." : state.error}</p>}</form>;
}
