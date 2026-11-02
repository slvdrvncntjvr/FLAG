import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getViewer } from "@/server/auth/guards";
import { getDb } from "@/server/db";
import { deliverExport } from "@/features/privacy/exports";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token || new URL(request.url).search) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const { env } = await getCloudflareContext({ async: true });
  return deliverExport(await getDb(), env.PROOFS, deliveryId, token, (await getViewer())?.id ?? null);
}
