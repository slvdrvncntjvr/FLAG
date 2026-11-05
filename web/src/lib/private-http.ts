// Pure early denials: no bindings, identity lookups, storage or framework setup.
export function unavailableProof() {
  return Response.json({ error: "This log or proof is unavailable." }, {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export function unsafeExportDenial(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7) || new URL(request.url).search) {
    return new Response(null, { status: 404, headers: {
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
    } });
  }
  return null;
}

export function privateResourcePreflight(request: Request) {
  if (request.method !== "GET") return null;
  const path = new URL(request.url).pathname;
  if (/^\/api\/proofs\/[^/]+$/.test(path) && !request.headers.get("Cookie")?.trim()) return unavailableProof();
  if (/^\/api\/privacy\/exports\/[^/]+$/.test(path)) return unsafeExportDenial(request);
  // Cookie/header presence grants nothing. The existing handler authenticates
  // and rechecks each relationship, assessment, source deadline and one-use token.
  return null;
}
