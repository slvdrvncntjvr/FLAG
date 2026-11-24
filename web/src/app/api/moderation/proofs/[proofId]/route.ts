import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { downloadReviewProof } from "@/features/moderation/proof-view";
export async function GET(request: Request, { params }: { params: Promise<{ proofId: string }> }) {
  try {
    const viewer = await getViewer();
    const { env } = await getCloudflareContext({ async: true });
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(k => !["caseId", "revisionId", "expectedClaimUntil"].includes(k)) || ["caseId", "revisionId", "expectedClaimUntil"].some(k => url.searchParams.getAll(k).length !== 1)) throw new Error("invalid");
    return await downloadReviewProof(await getDb(), env.PROOFS, viewer?.id ?? null, (await params).proofId, Object.fromEntries(url.searchParams), env.BETTER_AUTH_SECRET);
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
