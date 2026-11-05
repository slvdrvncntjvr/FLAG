// Bounded recognition of concrete ID-number/payload bypasses, not arbitrary
// sensitive-content classification. Inspect a copy; never rewrite or log input.
const numberSequence = /\p{Nd}(?:[\s\p{P}\p{S}\p{M}]*\p{Nd}){5}/u;
// URL project identifiers commonly contain 6–11 digits. Retain recognition of
// full 12/16-digit national ID numbers, including separated/Unicode forms.
const fullNumberSequence = /\p{Nd}(?:[\s\p{P}\p{S}\p{M}]*\p{Nd}){11}/u;
// Retain recognizable shorter passport/licence token shapes without treating
// every ordinary numeric project identifier as a government number.
const fullIdToken = /(?<![\p{L}\p{N}])(?:[A-Z]{1,2}\p{Nd}{7}|[A-Z]\p{Nd}{2}[\s\p{P}\p{S}\p{M}]+\p{Nd}{2}[\s\p{P}\p{S}\p{M}]+\p{Nd}{6})(?![\p{L}\p{N}])/iu;
const markedPayload = /\b(?:data|blob)\s*:|\bbase64\b|\bqr(?:[\s_-]*(?:body|payload|data))?\s*["']?\s*[:=]|\b(?:id[\s_-]*(?:number|no|image|hash|name)|pcn|psn|passport[\s_-]*(?:number|no)|(?:phone|mobile)[\s_-]*(?:number|hash)?)\s*["']?\s*[:=#]/i;
const encodedImage = /(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|JVBERi0)|\b[a-f\d]{64}\b/i;
// Facts may spell out an identifier rather than use its abbreviation. Match
// labels on each normalized/decoded inspection round, before exempting dates
// or amounts; punctuation and Unicode whitespace may separate their words.
const governmentNumberMarker = String.raw`(?:[\s\p{P}]+(?:numbers?|nos?|identification|identity|identifiers?|ids?)|[\s\p{P}]*#)`;
// MID/member markers require a housing-fund label, not a bare project MID.
const housingFundLabel = String.raw`(?:pag[\s\p{P}]*ibig(?:[\s\p{P}]+fund)?|home[\s\p{P}]+development[\s\p{P}]+mutual[\s\p{P}]+fund|h[\s\p{P}]*d[\s\p{P}]*m[\s\p{P}]*f)`;
const membershipNumberMarker = String.raw`[\s\p{P}]+(?:m[\s\p{P}]*i[\s\p{P}]*d|member(?:ship)?(?:${governmentNumberMarker}|[\s\p{P}]+i[\s\p{P}]*d))`;
const fullGovernmentIdLabel = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:` + [
  String.raw`social[\s\p{P}]+security(?:[\s\p{P}]+(?:system|account))?${governmentNumberMarker}`,
  String.raw`tax(?:[\s\p{P}]*payer)?[\s\p{P}]+(?:identification|identity|identifier|id)`,
  String.raw`${housingFundLabel}(?:${governmentNumberMarker}|${membershipNumberMarker})`,
  String.raw`(?:government|national)[\s\p{P}]+(?:identification|identity|identifier|id)`,
  String.raw`(?:philippine[\s\p{P}]+(?:identification|identity)(?:[\s\p{P}]+system)?|government[\s\p{P}]+service[\s\p{P}]+insurance[\s\p{P}]+system|philippine[\s\p{P}]+health[\s\p{P}]+insurance(?:[\s\p{P}]+corporation)?|philsys[\s\p{P}]+card)${governmentNumberMarker}`,
].join("|") + String.raw`)(?![\p{L}\p{N}])`, "iu");

// A labelled complete number is sensitive even when its digit count also fits
// an ordinary project ID. URL labels may compose a known government alias or
// full agency name with account/member/identity/number terms. Only these terms
// extend the label: unrelated project words must not supply number context.
const urlGovernmentAlias = String.raw`(?<![\p{L}\p{N}])(?:` + [
  String.raw`t[\s\p{P}]*i[\s\p{P}]*n|s[\s\p{P}]*s[\s\p{P}]*s|s[\s\p{P}]*s[\s\p{P}]*n|g[\s\p{P}]*s[\s\p{P}]*i[\s\p{P}]*s`,
  String.raw`phil[\s\p{P}]*health|psn|pcn|phil[\s\p{P}]*sys|e?[\s\p{P}]*phil[\s\p{P}]*id|passport|licen[cs]e|id[\s\p{P}]+(?:number|no)`,
  housingFundLabel,
  String.raw`social[\s\p{P}]+security(?:[\s\p{P}]+system)?`,
  String.raw`government[\s\p{P}]+service[\s\p{P}]+insurance[\s\p{P}]+system`,
  String.raw`philippine[\s\p{P}]+health[\s\p{P}]+insurance(?:[\s\p{P}]+corporation)?`,
  String.raw`philippine[\s\p{P}]+(?:identification|identity)(?:[\s\p{P}]+system)?`,
].join("|") + String.raw`)(?![\p{L}\p{N}])`;
const urlGovernmentNumberSuffix = String.raw`(?:[\s\p{P}\p{S}\p{M}]+(?:numbers?|nos?|identification|identity|identifiers?|ids?|accounts?|members?(?:ship)?|cards?|m[\s\p{P}]*i[\s\p{P}]*d))*`;
const labelledUrlNumber = new RegExp(
  String.raw`(?:${fullGovernmentIdLabel.source}|${urlGovernmentAlias})${urlGovernmentNumberSuffix}[\s\p{P}\p{S}\p{M}]+(?:${numberSequence.source}|${fullIdToken.source})`,
  "iu",
);

function inspectVerificationText(value: string, rejectReviewLinks: boolean, hasNumber = (text: string) => numberSequence.test(text)): boolean {
  let inspected = value;
  // Four percent-decoding rounds support ordinary and nested URL content.
  // Reject remaining escapes at the limit instead of persisting uninspected data.
  for (let round = 0; round <= 4; round++) {
    inspected = inspected.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\+/g, " ");
    if (hasNumber(inspected) || markedPayload.test(inspected) || encodedImage.test(inspected)) return false;
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

// Facts are prose, not portfolio URLs. Keep the strict numeric/payload checks,
// with narrow exceptions for calendar dates and explicitly marked amounts.
export function hasNoLogFactsPayload(value: string): boolean {
  return inspectVerificationText(value, false, text => {
    // Never exempt a number in prose that identifies it as government ID data.
    if (/\b(?:TIN|SSS|GSIS|PhilHealth|Pag-IBIG|PSN|PCN|PhilSys|PhilID|ePhilID|passport|licen[cs]e|(?:government|national)[\s_-]*ID|ID[\s_-]*(?:number|no))\b/i.test(text) || fullGovernmentIdLabel.test(text)) {
      return numberSequence.test(text) || fullIdToken.test(text);
    }
    const withoutDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? "[date]" : date;
    });
    const withoutAmounts = withoutDates.replace(/(?:₱|\$|\b(?:PHP|USD)\b)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?![\d,]|\.\d)/gi, "[amount]");
    return numberSequence.test(withoutAmounts) || fullIdToken.test(withoutAmounts);
  });
}

export function hasNoVerificationUrlPayload(value: string): boolean {
  // Inspect raw input for markers and the decoding bound, then each structural
  // URL component for numbers. Query/fragment identifiers must not concatenate;
  // punctuation inside a single component must still reveal separated IDs.
  if (!inspectVerificationText(value, false, () => false)) return false;
  try {
    const url = new URL(value);
    // URL.hostname converts Unicode domains to ASCII punycode, hiding Nd digits.
    // Also inspect the original host, using URL's input trimming/control removal
    // and special-scheme authority boundaries before any percent/NFKC decoding.
    const source = value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "").replace(/[\t\n\r]/g, "");
    const afterScheme = source.slice(source.indexOf(":") + 1);
    const authority = /^(?:https?|ftp|wss?):$/.test(url.protocol)
      ? afterScheme.replace(/^[\\/]+/, "").split(/[\\/?#]/, 1)[0]
      : afterScheme.match(/^\/\/([^/?#]*)/)?.[1] ?? "";
    const host = authority.slice(authority.lastIndexOf("@") + 1);
    const originalHostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":", 1)[0];
    const pairs = Array.from(url.searchParams);
    const safeComponents = [originalHostname, url.hostname, url.pathname, url.hash.slice(1), ...pairs.flat()]
      .every(part => inspectVerificationText(part, false, (text) => {
        // Hex digits spelling an escape are not part of a number. Inspect the
        // decoded characters in the next round, within the same fixed budget.
        const decodedCopy = text.replace(/%[a-f\d]{2}/gi, "_");
        return labelledUrlNumber.test(decodedCopy) || fullNumberSequence.test(decodedCopy) || fullIdToken.test(decodedCopy);
      }));
    // Only a key and its own value share label context. Ordinary number checks
    // stay component-local so independent numeric keys/values cannot join into
    // a false full ID. Never join all query parameters into one inspection copy.
    return safeComponents && pairs.every(([key, content]) => inspectVerificationText(`${key}=${content}`, false,
      text => labelledUrlNumber.test(text.replace(/%[a-f\d]{2}/gi, "_"))));
  } catch { return false; }
}

export function hasNoVerificationReason(value: string): boolean {
  return inspectVerificationText(value, true);
}
