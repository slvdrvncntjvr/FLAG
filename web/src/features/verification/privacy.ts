// Bounded recognition of concrete ID-number/payload bypasses, not arbitrary
// sensitive-content classification. Inspect a copy; never rewrite or log input.
const numberSequence = /\p{Nd}(?:[\s\p{P}\p{S}\p{M}]*\p{Nd}){5}/u;
const markedPayload = /\b(?:data|blob)\s*:|\bbase64\b|\bqr(?:[\s_-]*(?:body|payload|data))?\s*["']?\s*[:=]|\b(?:id[\s_-]*(?:number|no|image|hash|name)|pcn|psn|passport[\s_-]*(?:number|no)|(?:phone|mobile)[\s_-]*(?:number|hash)?)\s*["']?\s*[:=#]/i;
const encodedImage = /(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|JVBERi0)|\b[a-f\d]{64}\b/i;

function inspectVerificationText(value: string, rejectReviewLinks: boolean): boolean {
  let inspected = value;
  // Four percent-decoding rounds support ordinary and nested URL content.
  // Reject remaining escapes at the limit instead of persisting uninspected data.
  for (let round = 0; round <= 4; round++) {
    inspected = inspected.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\+/g, " ");
    if (numberSequence.test(inspected) || markedPayload.test(inspected) || encodedImage.test(inspected)) return false;
    if (rejectReviewLinks && /https?:|</i.test(inspected)) return false;
    if (!/%[a-f\d]{2}/i.test(inspected)) return true;
    if (round === 4) return false;
    let malformed = false;
    inspected = inspected.replace(/(?:%[a-f\d]{2})+/gi, (escaped) => {
      try { return decodeURIComponent(escaped); }
      catch { malformed = true; return ""; }
    });
    if (malformed) return false;
  }
  return false;
}

export function hasNoVerificationPayload(value: string): boolean {
  return inspectVerificationText(value, false);
}

export function hasNoVerificationReason(value: string): boolean {
  return inspectVerificationText(value, true);
}
