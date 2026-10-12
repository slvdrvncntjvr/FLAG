---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.1
status: Draft
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-12
reconciled: 2026-10-12
---

# QA & Test Plan: FLAG

**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. Strategy

- **Automated, integration:** Vitest in the Cloudflare Workers pool against a fresh local D1 and R2 per test file. Every server action and route handler with a sad, abuse, or negative case below gets a test. These run on every pull request.
- **Automated, end-to-end:** Playwright for the happy paths of PRD-F7, PRD-F8, PRD-F9, PRD-F2 with PRD-F3, PRD-F4, and PRD-F6, at a 360 px viewport and at desktop width.
- **Manual (QA team):** a weekly test pass on a mid-range Android phone in Chrome and in the Messenger in-app browser, following the H cases for the features delivered that week. Results go in the course tracker.
- **Pilot (Nov 29 - Dec 12):** usability survey for FLAG-M8, owned by QA.
- **Deliberately untested:** see §6.

**Runner:** `npm test` and `npm run e2e` from `web/`
**Location:** `web/tests/`, `web/e2e/`

## 2. Happy path cases

| ID | PRD-F# | Case | Steps | Expected |
|----|--------|------|-------|----------|
| H-01 | PRD-F1 | Freelancer completes verification | Verify phone code, add a portfolio link, scan a valid PhilID QR, submit; moderator approves | Profile status `verified`; freelancer can create an engagement |
| H-02 | PRD-F2 | File a flagged log | On an accepted engagement choose Flagged, tags Late Payment, period, 60-character facts, one proof, submit | Log status `pending`; a `log` moderation case exists |
| H-03 | PRD-F3 | Attach proof | Add one PNG and one PDF under 10 MB | Both listed with kind and size; both stored in R2 under the log's prefix |
| H-04 | PRD-F4 | Approve a log | Moderator claims the oldest case, opens proof, approves with a reason | Log `published`; audit has claim and decision; filer and client notified |
| H-05 | PRD-F5 | Client replies | Client opens the published log, writes a reply, a moderator approves | Reply shows under the log labelled "Response from client" with its date |
| H-06 | PRD-F6 | Read a client record | Signed-in freelancer searches the client name and opens the record | Counts by outcome, stacked bar, tag counts, and logs newest first |
| H-07 | PRD-F7 | Sign up with an email code | Enter email, enter the code, choose Freelancer | Account created with role `freelancer`; redirected to onboarding |
| H-08 | PRD-F8 | Accept policies | New account reads and accepts the privacy notice, terms, and three freelancer statements | Acceptance rows stored with the current versions; app pages reachable |
| H-09 | PRD-F9 | Handshake | Freelancer creates an engagement and copies the link; client opens it, signs up, consents, accepts | Engagement `accepted`, `client_id` set, `client_consent` acceptance stored |
| H-10 | PRD-F10 | Corroborate | Second verified freelancer with their own accepted engagement with the client marks "Same experience" | Count on the log becomes 1 |
| H-11 | PRD-F6 | Limited record | Client with 3 published logs | Shows "Limited record" and the three logs; no stacked bar |

## 3. Sad path cases

| ID | PRD-F# | Case | Input | Expected |
|----|--------|------|-------|----------|
| S-01 | PRD-F1 | Wrong phone code | Three wrong codes | Each rejected with "Code is incorrect"; fourth attempt rate limited |
| S-02 | PRD-F1 | Unreadable QR | A photo of a barcode that is not a PhilID | 422 `unreadable`; message asks to rescan |
| S-03 | PRD-F2 | Positive with only a risk tag | Outcome Positive, tag Late Payment | Blocked: "A positive log needs at least one positive tag and no risk tags" |
| S-04 | PRD-F2 | Missing fields | No period, facts of 10 characters | Both fields named in field errors; nothing stored |
| S-05 | PRD-F3 | Oversized file | 12 MB JPEG | 413; message states the 10 MB limit |
| S-06 | PRD-F3 | Wrong type | `.exe` renamed to `.pdf` | Rejected by signature check |
| S-07 | PRD-F4 | Decide without a reason | Moderator clicks Approve with an empty reason | Blocked: reason required |
| S-08 | PRD-F4 | Claimed by someone else | Second moderator opens a claimed case | Read-only, shows who holds it and until when |
| S-09 | PRD-F5 | Reply too long | 2,500 characters | Field error with the limit |
| S-10 | PRD-F6 | No match | Search for a name no client has | "No registered client matches" with a hint that clients join through an engagement invite |
| S-11 | PRD-F7 | Expired code | Email code used after expiry | Rejected; option to send a new code |
| S-12 | PRD-F8 | Policy version changed | Policy version bumped while a user is signed in | Next page load shows the acceptance screen again |
| S-13 | PRD-F9 | Expired invite | Open a link after 14 days | "This invite has expired"; engagement `expired` |
| S-14 | PRD-F9 | Client declines | Client chooses Decline | Engagement `declined`; freelancer cannot start a log for it |
| S-15 | PRD-F10 | Duplicate corroboration | Same freelancer corroborates twice | Second attempt is a no-op; count unchanged |

## 4. Abuse cases

| ID | PRD-F# | Vector | Attempt | Expected defense |
|----|--------|--------|---------|------------------|
| AB-01 | PRD-F1 | Forged ID | QR JSON with a valid shape and a made-up signature | 422 `signature_invalid`; audit event; nothing stored |
| AB-02 | PRD-F1 | One ID, many accounts | Second account submits the same valid QR | 409 `id_in_use`; duplicate visible on the case |
| AB-03 | PRD-F2 | Second log on one engagement | Call `submitLog` twice for the same engagement | Second rejected by UNIQUE `engagement_id` |
| AB-04 | PRD-F2 | Free-text tag | Post a tag value "Scammer" directly to the action | Rejected by Zod and by the CHECK constraint |
| AB-05 | PRD-F3 | Upload to someone else's log | Freelancer B posts a file to A's draft log id | 404; nothing written to R2 |
| AB-06 | PRD-F3 | Upload after submission | Add proof to a `pending` log | 409; proof set is frozen |
| AB-07 | PRD-F4 | Self-review | Moderator who is the filer, or who has an engagement with the client, tries to claim | Claim refused with a conflict reason |
| AB-08 | PRD-F4 | Non-moderator decides | Freelancer calls `decideCase` | 404 |
| AB-09 | PRD-F5 | Reply as another client | Client B posts a reply to a log about client A | 404 |
| AB-10 | PRD-F6 | Enumerate client ids | Signed-in user requests 200 sequential or random ids in a minute | Rate limited; ids are random, not sequential |
| AB-11 | PRD-F6 | Script injection in facts | Facts contain `<script>` and an `onerror` image tag | Rendered as text; no script runs |
| AB-12 | PRD-F7 | Role escalation | Client sets `role=moderator` in a sign-up or profile update payload | Field ignored; role unchanged |
| AB-13 | PRD-F8 | Skip onboarding | New account requests `/clients` directly | Redirected to onboarding; data actions refuse |
| AB-14 | PRD-F9 | Reuse an invite | Accept the same link from a second client account | Refused; engagement already accepted |
| AB-15 | PRD-F9 | Self-invite | Freelancer opens their own invite and signs up a second account as the client to log themselves | Second account must be a client with a different email and phone; the moderator sees both accounts share an IP; flagged for review |
| AB-16 | PRD-F10 | Pile-on | Verified freelancer without an engagement with the client corroborates | Refused; no control shown |
| AB-17 | PRD-F3 | Path traversal | Proof file name `../../etc/passwd` | Object key is generated server-side; the client file name is never used in the key |

### 4.1 Negative tests (invariants)

| ID | INV-# | Attempt to break the rule | Expected |
|----|-------|---------------------------|----------|
| NT-01 | INV-1 | Signed-in freelancer with no relation fetches a `pending` log through the record page and the query layer directly | Not present in the page; query returns nothing |
| NT-02 | INV-1 | Any code path other than `decideCase` sets `status = 'published'` | Static test: grep finds `published` assignments only in the moderation decision module |
| NT-03 | INV-2 | Submit a log with zero proof files, bypassing the form | Rejected by the handler; a raw SQL update to `pending` is rejected by trigger `log_requires_proof` |
| NT-04 | INV-2 | Submit a log on an engagement in `invited` or `declined` state | Rejected |
| NT-05 | INV-3 | Run the ID check with a valid QR, then search the D1 export, R2 listing, and captured Worker logs for the PCN digits and name | No match anywhere |
| NT-06 | INV-4 | Request `/api/proofs/[id]` as an unrelated signed-in user, as a signed-out visitor, and with a guessed R2 URL | 404, 404 (or sign-in redirect), and no public endpoint |
| NT-07 | INV-5 | Schema and UI scan for fields or text named score, rating, rank, average, stars, or "top" | None found; record page shows counts only |
| NT-08 | INV-6 | Client account calls any log, tag, or proof mutation for a log about them, and runs a raw SQL update on a published log's facts | Actions return 404; trigger `log_frozen_facts` rejects the update |
| NT-09 | INV-7 | Signed-out request to `/clients/[id]` and `/clients?q=`; request with a crawler user agent | Redirect to sign-in; no record content in the response; `X-Robots-Tag: noindex` present |
| NT-10 | INV-8 | Unverified freelancer, and verified freelancer missing the current policy acceptance, each call `createEngagement`, `submitLog`, `corroborate` | All refused |

## 5. Coverage matrix

| PRD-F# | Happy | Sad | Abuse |
|--------|-------|-----|-------|
| PRD-F1 | H-01 | S-01, S-02 | AB-01, AB-02 |
| PRD-F2 | H-02 | S-03, S-04 | AB-03, AB-04 |
| PRD-F3 | H-03 | S-05, S-06 | AB-05, AB-06, AB-17 |
| PRD-F4 | H-04 | S-07, S-08 | AB-07, AB-08 |
| PRD-F5 | H-05 | S-09 | AB-09 |
| PRD-F6 | H-06, H-11 | S-10 | AB-10, AB-11 |
| PRD-F7 | H-07 | S-11 | AB-12 |
| PRD-F8 | H-08 | S-12 | AB-13 |
| PRD-F9 | H-09 | S-13, S-14 | AB-14, AB-15 |
| PRD-F10 | H-10 | S-15 | AB-16 |

### 5.1 Invariant coverage

| INV-# | Negative tests |
|-------|----------------|
| INV-1 | NT-01, NT-02 |
| INV-2 | NT-03, NT-04 |
| INV-3 | NT-05 |
| INV-4 | NT-06 |
| INV-5 | NT-07 |
| INV-6 | NT-08 |
| INV-7 | NT-09 |
| INV-8 | NT-10 |

## 6. Not tested

| Area | Why not tested | Risk accepted by |
|------|---------------|------------------|
| Liveness: the person scanning is the person on the ID | Out of scope per RFC 001 §2 | `TBD(owner)` |
| Load beyond pilot scale | Pilot is 20-30 users | `TBD(owner)` |
| iOS Safari below 16 | Not in the pilot device mix | `TBD(owner)` |
| Malware inside PDFs | No scanner on the free stack; PDFs are opened only by moderators in the browser's PDF viewer | `TBD(owner)` |

## 7. Release gate

- [ ] All Must-Have happy cases pass
- [ ] All Must-Have sad cases pass
- [ ] All abuse cases pass or have a signed-off exception in §6
- [ ] All invariant negative tests pass; no exceptions allowed
- [ ] No secrets in test fixtures
