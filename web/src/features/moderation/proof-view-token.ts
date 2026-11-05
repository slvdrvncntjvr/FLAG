// A short-lived receipt for bytes delivered under this actor's exact lease.
// This records delivery and a personal-view attestation, not an automated evidence verdict.
export type ProofView = { actorId: string; caseId: string; revisionId: string; proofId: string; sha256: string; objectKey: string; size: number; lease: string };
type Receipt = ProofView & { domain: "flag-proof-view-v1"; issuedAt: string; expiresAt: string };
function bytes(value: string) { return new TextEncoder().encode(value); }
async function key(secret: string) {
  if (!secret) throw new Error("proof receipt unavailable");
  return crypto.subtle.importKey("raw", bytes(`flag-proof-view-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
export async function issueProofView(secret: string, view: ProofView) {
  const receipt: Receipt = { ...view, domain: "flag-proof-view-v1", issuedAt: new Date().toISOString(), expiresAt: view.lease };
  const payload = base64(bytes(JSON.stringify(receipt)));
  return `${payload}.${base64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), bytes(payload))))}`;
}
export async function verifyProofView(secret: string, token: string, expected: ProofView): Promise<string | null> {
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra || !payload || !signature || Date.parse(expected.lease) <= Date.now()) return null;
    if (!await crypto.subtle.verify("HMAC", await key(secret), decode(signature), bytes(payload))) return null;
    const actual = JSON.parse(new TextDecoder().decode(decode(payload))) as Receipt;
    if (actual.domain !== "flag-proof-view-v1" || actual.expiresAt !== expected.lease || !Number.isFinite(Date.parse(actual.issuedAt)) || Date.parse(actual.issuedAt) > Date.now() || actual.issuedAt > actual.expiresAt) return null;
    return Object.keys(expected).every(k => actual[k as keyof ProofView] === expected[k as keyof ProofView]) ? actual.issuedAt : null;
  } catch { return null; }
}
