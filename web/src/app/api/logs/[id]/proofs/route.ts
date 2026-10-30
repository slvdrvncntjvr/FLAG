import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/server/db";
import { getViewer } from "@/server/auth/guards";
import { uploadProof } from "@/features/logs/proofs";
import { isPrivateIntakeEnabled } from "@/features/logs/rollout";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: "This log or proof is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    // Route handlers do not inherit Server Action origin/CSRF checks.
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) return Response.json({ error: "This request is unavailable." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (!await isPrivateIntakeEnabled()) return Response.json({ error: "Private log intake is unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    const [{ id }, db, { env }] = await Promise.all([context.params, getDb(), getCloudflareContext({ async: true })]);
    return uploadProof(db, env.PROOFS, viewer.id, id, request);
  } catch { return Response.json({ error: "Could not upload this proof. Try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
