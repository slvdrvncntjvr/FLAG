import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { downloadProof } from "@/features/logs/proofs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: "This log or proof is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const [{ id }, db, { env }] = await Promise.all([context.params, getDb(), getCloudflareContext({ async: true })]);
    return downloadProof(db, env.PROOFS, viewer.id, id);
  } catch { return Response.json({ error: "This log or proof is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
