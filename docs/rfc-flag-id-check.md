---
spine_type: RFC
spine_version: 0.3.0
project: FLAG
slug: flag
rfc_id: flag-rfc-001
doc_version: 0.1
status: Draft
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-12
reconciled: 2026-10-12
---

# RFC 001: Government ID check without storing the ID

**Implements:** PRD-F1
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. Problem

The course goal requires "ID validation" for every freelancer who files. The obvious build is an ID photo upload that a moderator looks at. That makes FLAG a holder of sensitive personal information under RA 10173 Sec. 3(l), with breach notification duties (NPC Circular 16-03, 72 hours) and a registration and DPO duty once 1,000 or more people are processed (NPC Circular 2022-04). INV-3 forbids it.

The Philippine National ID (PhilID card, ePhilID, and the eGovPH digital ID) carries a QR code signed by PSA. If FLAG can check that signature, it can trust the name on the ID and detect one ID being used by two accounts without keeping the image or the number.

## 2. Goals and non-goals

**Goals**
- Confirm that a freelancer holds a genuine PSA-issued National ID.
- Confirm the name on the ID matches the account name, and tell the moderator whether it does.
- Stop one ID from verifying more than one FLAG account.
- Persist nothing from which the ID number, photo, birth date, or address can be recovered.

**Non-goals**
- Proving the person holding the phone is the person on the ID (liveness). The phone code and moderator review are the v1 mitigation.
- Calling PhilSys online endpoints. The verify.philsys.gov.ph API is not documented for third parties; becoming a relying party through eVerify is a later option.
- Other ID types (driver's licence, UMID, passport). See §5 and LOG Q8.

## 3. Design

1. On the verification page the freelancer scans their ID's QR with the camera, or picks a screenshot of their ePhilID. The QR is decoded in the browser (`jsqr`). The image never leaves the device.
2. The browser sends only the decoded QR text to `POST /api/verification/id-check`.
3. The handler, in memory:
   - detects the format (legacy JSON PhilID card, or ePhilID/eGovPH compact format);
   - verifies the PSA signature;
   - extracts PCN, first name, last name;
   - computes `id_hash = HMAC-SHA256(ID_HASH_KEY, normalize(PCN))`;
   - compares normalized names with the account name;
   - drops every other field, including the embedded photo.
4. It writes to FREELANCER_PROFILE only `id_hash`, `id_checked_at`, and `id_name_match`. If `id_hash` already belongs to another profile, it writes nothing and returns `409`.
5. The moderator's verification case shows "ID check passed", "Name matches: yes/no", and duplicate attempts from the audit trail. Never the ID.

`ID_HASH_KEY` is a Worker secret. Without it, an attacker holding the database cannot test PCNs against `id_hash`, because the PCN space (16 digits) would otherwise be small enough to brute-force against a plain hash.

## 4. Specification

**Request:** `POST /api/verification/id-check`, `Content-Type: application/json`, body `{ "qr": string }`, maximum 8 KB. Requires a signed-in freelancer with `phone_number_verified = 1` and profile status `unverified` or `rejected`.

**Legacy PhilID card (v1):** the QR text is JSON with top-level keys `d` (issue date), `i` (issuer), `img` (photo), `sb` (subject: `PCN`, `fn`, `mn`, `ln`, `s`, `sf`, `DOB`, `POB`, `BF`), and a signature. Verify the Ed25519 signature over the subject with WebCrypto (`crypto.subtle.verify("Ed25519", ...)`), using PSA's public key stored as the Worker variable `PHILSYS_ED25519_PUBLIC_KEY`.
- `TBD(owner)`: the authoritative source of that public key and the exact signed byte string are not confirmed. The only public reference found (bettergovph/openverify, `src/lib/philsys/verification.ts`) falls back to a key from "the original dump". Week 3 spike: confirm both against real cards from team members before relying on it (LOG Q13).

**ePhilID / eGovPH (v3):** strip the prefix, base45-decode, inflate, CBOR-decode, check the country code.
- `TBD(owner)`: whether this format carries a signature FLAG can check offline is unconfirmed (LOG Q13). If it does not, a v3 QR is accepted only as "ID presented, not cryptographically checked", and the moderator sees that label.

**Normalization:**
- `normalize(PCN)`: digits only.
- Names: Unicode NFKD, strip diacritics, uppercase, collapse whitespace.
- `id_name_match = 1` when the account's normalized name contains both the ID's normalized first-name token and last name.

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ "ok": true, "nameMatch": true }` | Signature valid, hash stored |
| 409 | `{ "error": "id_in_use" }` | `id_hash` belongs to another profile |
| 422 | `{ "error": "unreadable" }` | Not a recognized format |
| 422 | `{ "error": "signature_invalid" }` | Signature check failed |
| 429 | `{ "error": "rate_limited" }` | More than 5 attempts per user per hour |

Every outcome writes an AUDIT_EVENT with `action = id_check`, the result code, and no QR content.

### 4.1 Worked example

```
Input:  { "qr": "<legacy PhilID JSON text, PCN 1234-5678-9012-3456, fn JUAN, ln DELA CRUZ>" }
        account name "Juan Dela Cruz"
Stored: id_hash        = HMAC-SHA256(ID_HASH_KEY, "1234567890123456") as hex
        id_checked_at  = "2026-11-03T09:12:44Z"
        id_name_match  = 1
Output: 200 { "ok": true, "nameMatch": true }
Not stored anywhere: PCN, name on ID, DOB, POB, sex, photo, raw QR text
```

## 5. Edge cases

| Case | Behavior |
|------|----------|
| Freelancer has no National ID | Cannot pass this step; fallback is `TBD(owner)` (LOG Q8) |
| Name on ID differs (married name, nickname) | Check passes with `nameMatch: false`; moderator decides and may ask for the portfolio to show the same name |
| Same ID, second account | 409, audit event, moderator sees it on the second account's case |
| Account deleted | `id_hash` deleted with the profile; the ID can verify a new account |
| Screenshot of someone else's ePhilID | Not prevented by this check; phone code plus moderator review are the mitigation; liveness is a non-goal |
| QR payload larger than 8 KB | 413 before parsing |
| `ID_HASH_KEY` rotated | Existing hashes stop matching; rotation needs a re-check campaign, so the key is never rotated casually |

## 6. Security considerations

- The handler must not log the request body. It is excluded from request logging, and errors are caught and replaced with codes before anything reaches observability logs.
- The decoded photo is a base64 string inside the payload. It is never decoded into an image, written, or returned.
- HMAC with a secret key, not a plain hash, because 16-digit PCNs are brute-forceable.
- A forged QR fails signature verification. A replayed genuine QR (someone else's ID) is the residual risk, covered by §5.
- The QR is decoded in the browser, so the image is never sent over the network.

## 7. Alternatives considered

| Alternative | Rejected because |
|------------|------------------|
| ID photo upload with moderator viewing | Breaks INV-3; sensitive personal information under RA 10173 |
| Upload ID, review, delete after decision | Still processes and holds sensitive information during review; a breach in that window is reportable |
| KYC vendor (Veriff about USD 0.80 per check plus USD 49 a month; Sumsub about USD 1.35 per check plus USD 149 a month) | Cost for a student pilot; kept as a PRD candidate |
| Proxy to verify.philsys.gov.ph | Undocumented endpoint; terms-of-service risk |
| PhilSys eVerify relying-party onboarding | Requires organizational onboarding with PSA; revisit after the pilot |

## 8. Verification

- QAD H-01, S-02, AB-01, AB-02 and NT-05 cover this RFC.
- The Week 3 spike signs off when two genuine PhilID cards from team members pass, one tampered payload fails, and the database dump after both contains no PCN digits (grep for the 16-digit number returns nothing).
