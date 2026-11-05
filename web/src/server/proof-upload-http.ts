import { createDb } from "@/server/db";
import { createAuth } from "@/server/auth/config";
import { loadViewer } from "@/server/db/queries/viewer";
import { uploadProof } from "@/features/logs/proofs";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
const denied = () => Response.json({ error: "This log or proof is unavailable." }, { status: 404 });
const unavailable = () => Response.json({ error: "Could not upload this proof. Try again." }, { status: 503 });

// This route needs no Next render context. Keep all mutable authority within the
// request and use the same auth hooks and upload domain function as the app.
export async function proofUploadHttp(request: Request, env: CloudflareEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = request.method === "POST" && /^\/api\/logs\/([A-Za-z0-9_-]{1,100})\/proofs$/.exec(url.pathname);
  if (!match) return null;
  let authHeaders: Headers | undefined;
  const finish = (response: Response) => {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(privateHeaders)) headers.set(key, value);
    for (const cookie of authHeaders?.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
    return new Response(response.body, { status: response.status, headers });
  };
  try {
    if (!request.headers.get("cookie")?.trim()) return finish(denied());
    if (request.headers.get("origin") !== url.origin) {
      return finish(Response.json({ error: "This request is unavailable." }, { status: 403 }));
    }
    if (env.PRIVATE_INTAKE_ENABLED !== "true") {
      return finish(Response.json({ error: "Private log intake is unavailable." }, { status: 503 }));
    }
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const sessionHeaders = new Headers();
    for (const key of ["cookie", "cf-connecting-ip", "user-agent"]) {
      const value = request.headers.get(key);
      if (value !== null) sessionHeaders.set(key, value);
    }
    const sessionResponse = await auth.handler(new Request(new URL("/api/auth/get-session", env.BETTER_AUTH_URL), { headers: sessionHeaders }));
    authHeaders = sessionResponse.headers;
    if (!sessionResponse.ok) {
      const error = await sessionResponse.json().catch(() => null) as { code?: string } | null;
      if (sessionResponse.status === 403 && error?.code === "ACCOUNT_UNAVAILABLE") return finish(denied());
      if (sessionResponse.status === 429) {
        const response = Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
        const retry = sessionResponse.headers.get("Retry-After");
        if (retry && /^\d{1,6}$/.test(retry)) response.headers.set("Retry-After", retry);
        return finish(response);
      }
      return finish(unavailable());
    }
    const session = await sessionResponse.json() as { user?: { id?: string } } | null;
    if (!session?.user?.id) return finish(denied());
    const viewer = await loadViewer(db, session.user.id);
    if (!viewer || viewer.banned) return finish(denied());
    return finish(await uploadProof(db, env.PROOFS, viewer.id, match[1], request));
  } catch {
    return finish(unavailable());
  }
}
