import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";
import { uploadProposalProof } from "@/features/updates/proofs";
export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!await isPrivateIntakeEnabled()) return Response.json({ ok: false, error: "Private intake is unavailable." }, { status: 503, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  try {
    const viewer = await getViewer(), { env } = await getCloudflareContext({ async: true });
    return await uploadProposalProof(await getDb(), env.PROOFS, viewer?.id ?? null, { revisionId: (await params).revisionId }, request);
  } catch { return new Response(null, { status: 503, headers }); }
}
