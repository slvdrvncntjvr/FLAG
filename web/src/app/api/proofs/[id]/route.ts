import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { downloadProof } from "@/features/logs/proofs";
import { unavailableProof } from "@/lib/private-http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return unavailableProof();
    const [{ id }, db, { env }] = await Promise.all([context.params, getDb(), getCloudflareContext({ async: true })]);
    return downloadProof(db, env.PROOFS, viewer.id, id);
  } catch { return unavailableProof(); }
}
