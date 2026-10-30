---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.45
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-30
reconciled: 2026-10-13
---

# QA & Test Plan: FLAG

**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. Strategy

The tables in §2 to §6 are the approved product and invariant test plan. A planned case is not evidence that its workflow exists or passes. Auth, onboarding, manual verification with shared review, and consent-first engagements are implemented; private log intake is disabled by default and ends at pending, and the remaining workflows are planned. Current status is in [INDEX §6](index.md#6-current-development-baseline). Git history and LOG keep past run results.

**Required evidence for a candidate.** Run `npm run typecheck`, `npm run lint`, `npm test` (Workers integration and negative tests), `npm run test:deploy`, and `npm run test:e2e` (desktop 1280px and mobile 360px). Build the dev and production Workers (`npm run build:worker:dev`, `npm run build:worker`) with their binding guards, then run `npm run test:worker:smoke`. These local checks send no mail. They do not prove deployed authenticated flows, real OAuth, or physical-device behavior. After a deploy, the release check is green CI plus the manual smoke check.

**Owner acceptance.** Synthetic local tests, including browser runs, never count as owner or human acceptance. Owner checks are recorded in §7.1.

**Owner-approved regression scope (2026-10-26).** Standard-auth user create and update reject recognizable ID-number, name or image payloads before persistence (INV-3, NT-05). Ordinary numeric portfolio project URLs succeed, while marked or encoded ID payloads still reject. A corrected new verification request keeps immutable case-specific name, city and portfolio snapshots. Legacy snapshots stay unknown rather than fabricated. Additive migration 0007 preserves existing rows and triggers and rejects snapshot mutation. H-24, H-25, S-38 and the applicable abuse and negative tests cover this scope. Policy reacceptance uses the current POLICY_VERSIONS and S-12. Desktop and 360px browser cases exercise rejection, corrected resubmission, reopening the original review, and approval.

**Private intake scope.** PRD-F2, PRD-F3 and per-log PRD-F14 intake stops at pending. Migration 0009 tests prove that populated 0008 data is preserved (legacy activity stays NULL), FKs are clean, and ledger reapplication is an exact no-op. They also prove that raw INSERT or UPDATE cannot bypass pending or publish, that proof and an accepted engagement are required, that filing dates use inclusive Asia/Manila dates, and that quota competition holds. Submitted parent, revision, tag and proof rows are frozen. Intake tests cover case opening with atomic rollback, the current pointer staying NULL, upload reservation and HEAD integrity, compensation and tombstone races, the max-five proof and twenty-attempt quotas, hold-aware 30-day cleanup, and generated attachment-only no-store/nosniff delivery. Existing case IDs: H-02, H-03, H-19, S-03 to S-06, S-16, S-17, S-25, AB-03 to AB-06, AB-17, AB-20, AB-21, and NT-01 to NT-04, NT-06, NT-08, NT-10. Aggregate PRD-F14 (H-15, H-20) and real PRD-F4 decisions are later work.

**Intake rollout guard (SDD §3.7).** Default, false or malformed server settings deny every intake mutation and new-draft routing without parsing uploads or touching DB, R2 or cleanup. Existing authorized private reads continue and drafts stay read-only. Test disabled paths against migration 0008 and enabled local paths against 0009, and reject client-supplied enablement. Synthetic local harnesses enable intake explicitly.

**Government-ID label regressions (NT-05).** Spelled-out ID labels, currency-prefixed or encoded ID numbers, and PSN/PCN labels are rejected on both the initial draft save and a draft edit, with real-D1 no-write checks. Legitimate dates and marked amounts still save.

**Browser OTP isolation (AB-36).** Browser scenarios use scenario-local synthetic network headers, so unrelated tests get separate OTP send buckets. Actors within one scenario share a bucket. D1 counters and production limits are not reset or changed.

## 2. Happy path cases

Verification additions below are acceptance gates for SDD §3.5, not evidence of implemented workflows or passing tests. The first verification delivery includes its shared review/audit foundation; later log/correction handlers remain gated on their own delivery.

| ID | PRD-F# | Case | Steps | Expected |
|----|--------|------|-------|----------|
| H-01 | PRD-F1 | Freelancer completes verification | Complete a manual live ID inspection (supported ID plus portfolio link) with a moderator; moderator records reviewer, method, result, name-match, and time, then approves | Profile status `verified` with identity-checked meaning (never a trustworthiness guarantee); freelancer can create an engagement |
| H-02 | PRD-F2 | File a log with a rating | On an accepted engagement choose rating 2, tags Late Payment and Unresponsive, period, 60-character facts, no amount, one proof, submit | Log status `pending` with the amount empty; a `log` moderation case exists; rating stored 2 with derived outcome Negative |
| H-03 | PRD-F3 | Attach proof | Add one PNG and one PDF under 10 MB | Both listed with kind and size; both stored in R2 under the log's prefix |
| H-04 | PRD-F4 | Approve a log | Moderator claims the oldest case, opens proof, approves with a reason on a real project whose key claims the proof supports | Log `published` with original `published_at` and expiry set; audit has claim and decision; filer and client notified |
| H-05 | PRD-F5 | (Retired) Client replies | Retired 2026-10-13 with PRD-F5; no public reply path is tested | N/A |
| H-06 | PRD-F6 | Read a client record | Signed-in freelancer searches the client name and opens the record | Average to one decimal with contributor count, outcome counts, tag counts, and published logs newest first with filer names and approved dated update metadata only |
| H-07 | PRD-F7 | Sign up with an email code | Enter email, enter the code, choose Freelancer | Account created with role `freelancer`; redirected to onboarding |
| H-08 | PRD-F8 | Accept policies | New account reads and accepts the privacy notice, terms, and three freelancer statements | Acceptance rows stored with the current versions; app pages reachable |
| H-09 | PRD-F9 | Handshake | Freelancer creates an engagement and copies the link; client opens it, signs up, consents, accepts | Engagement `accepted`, `client_id` set, `client_consent` acceptance stored |
| H-10 | PRD-F10 | (Retired) Corroborate | Retired 2026-10-13 with PRD-F10; no same-experience path is tested | N/A |
| H-11 | PRD-F6 | Limited record counts people, not logs | Client with five published logs from two distinct contributors | Shows the average with count 2 and the Limited record label; all five logs readable |
| H-12 | PRD-F4 | Ask-changes preserves eligibility | Moderator asks-changes on a log whose first submission was complete and on time; filer resubmits corrections after the 15-day deadline | Resubmission continues the same log; no new filing and no clock reset; first-submitted and anchor dates unchanged |
| H-13 | PRD-F13 | Client correction is corrected | Named client files a private correction with counter-proof; an independent unconflicted moderator corrects | New revision published with approved dated update metadata; original `published_at` and expiry unchanged; private request and counter-proof never shown to readers |
| H-14 | PRD-F13 | Filer posts a later-dated update | Filer submits a paid-late update with proof for their own published log; moderator approves the revised content and rating | New approved revision shown with its date; original publication date still anchors retention |
| H-15 | PRD-F14 | First average from the first contributor | First approved log for a client (rating 4) | Record shows the average with contributor count 1 and the Limited record label |
| H-16 | PRD-F14 | Positive log may carry a risk tag | Rating 5 with tag Late Payment and supporting proof; moderator approves | Published Positive; the tag shows beside it; no tag combination overrides the star-derived outcome |
| H-17 | PRD-F12 | Data request resolved | User files an export request; admin resolves with the outcome recorded | Request `done` with its outcome; no blanket data retention promised |
| H-18 | PRD-F12 | Account close assessed | User requests account closure | Assessed individually within 30 days; outcome recorded; surviving records follow the approved lifecycle |
| H-19 | PRD-F2 | File a log with covered period and optional amount | On an accepted engagement choose rating 4, tags On-time Payment, covered work start/end dates within the engagement, amount 50000 centavos, 60-character facts, one proof, submit | Log `pending` with period_start/period_end and amount_centavos stored; rating stored 4 with derived outcome Positive |
| H-20 | PRD-F14 | Older published contribution survives a newer rejected log | Pair has an older published log (rating 5); filer files a second log on a newer engagement that is rejected | Average still counts the older 5 with the contributor retained; the rejected log contributes nothing |
| H-21 | PRD-F12 | Account close deactivates without cascade | User with a published log inside its 12-month term requests closure; admin closes after assessment | Account deactivated with access revoked and sessions gone; published log, proofs, and consent history retained to their deadlines; no USER cascade wipe |
| H-22 | PRD-F12 | Maintenance purges expired eligible rows | Expired published log past its 12-month deadline with no hold; run the maintenance function | Eligible rows and their R2 objects purged through the ordered protocol; parents only after eligible children |
| H-23 | PRD-F7 | Durable logout and replay rejection | Sign in, retain the original cookie, sign out successfully, then replay it; repeat logout and concurrent retries | Session row removed, cookie cleared, replay has no session; repeated/concurrent valid logout remains idempotent |
| H-24 | PRD-F1 | Pending request through live inspection | Freelancer captures account/profile name and portfolio, submits; moderator claims, records actual live inspection and approves with reason | Before inspection all five evidence fields NULL, exactly one open case and profile pending; inspection alone grants nothing; decision atomically verifies profile and closes both rows with matching decision/time and ids-only audit |
| H-25 | PRD-F4 | Release and expired-claim recovery | Claim verification, release, reclaim; expire lease, then let another moderator reclaim and reinspect | Each successful transition audited; leases last 30 minutes; different reviewer cannot decide from predecessor's inspection; original evidence never attributed to new reviewer |
| H-26 | PRD-F7 | Email-code sign-in survives passwordless hardening | Request and use an ordinary email sign-in code after denied password operations; inspect stored account fields | Sign-in succeeds; no password credential or hash is created; optional configured Google provider remains configured |

## 3. Sad path cases

| ID | PRD-F# | Case | Input | Expected |
|----|--------|------|-------|----------|
| S-01 | PRD-F1 | Wrong email code | Three wrong codes | Each rejected with "Code is incorrect"; further attempts rate limited |
| S-02 | PRD-F1 | Name on ID differs | Live inspection passes but the ID name does not match the account name | Case records name-match false; moderator decides with a reason; profile stays `pending` until decided |
| S-03 | PRD-F2 | Out-of-range or fractional rating | Rating 0, 6, or 2.5 | Rejected: rating must be an integer from 1 to 5; the DB CHECK (`typeof(rating) = 'integer'`) rejects 2.5 even past the handler; nothing stored |
| S-04 | PRD-F2 | Missing fields, amount omitted | No period, facts of 10 characters, no amount | Period and facts named in field errors; missing amount is fine; nothing stored |
| S-05 | PRD-F3 | Oversized file | 12 MB JPEG | 413; message states the 10 MB limit |
| S-06 | PRD-F3 | Wrong type | `.exe` renamed to `.pdf` | Rejected by signature check |
| S-07 | PRD-F4 | Decide without a reason | Moderator clicks Approve with an empty reason | Blocked: reason required |
| S-08 | PRD-F4 | Claimed by someone else | Second moderator opens a claimed case | Read-only, shows who holds it and until when |
| S-09 | PRD-F5 | (Retired) Reply too long | Retired 2026-10-13 with PRD-F5 | N/A |
| S-10 | PRD-F6 | No match | Search for a name no client has | "No registered client matches" with a hint that clients join through an engagement invite |
| S-11 | PRD-F7 | Expired code | Email code used after expiry | Rejected; option to send a new code |
| S-12 | PRD-F8 | Policy version changed | Policy version bumped while a user is signed in | Next page load shows the acceptance screen again |
| S-13 | PRD-F9 | Expired invite | Open a link after 14 days | "This invite has expired"; engagement `expired` |
| S-14 | PRD-F9 | Client declines | Client chooses Decline | Engagement `declined`; freelancer cannot start a log for it; no warning or negative signal shown anywhere |
| S-15 | PRD-F10 | (Retired) Duplicate corroboration | Retired 2026-10-13 with PRD-F10 | N/A |
| S-16 | PRD-F2 | Filing deadline boundary, Asia/Manila | Anchor 1 April: submit 16 April, then submit 17 April | 16 April accepted; 17 April rejected as late; no extra grace |
| S-17 | PRD-F2 | Future anchor | Anchor date after the submission date | Rejected: the event cannot be in the future |
| S-18 | PRD-F2 | Ask-changes on missing context | Log claims a real project but key claims lack supporting proof | Moderator asks-changes with the missing context named; log not published |
| S-19 | PRD-F2 | Reject on unsupported claims | Log with no real project behind it | Moderator rejects with reasons; rejected material kept 30 days after the final decision |
| S-20 | PRD-F13 | Second open correction | Correction request filed while one is already open on the same log | Rejected: one open request per log |
| S-21 | PRD-F13 | Repeat without new evidence | New request after a decided one with no new evidence or uploads | Rejected: repeats need new evidence |
| S-22 | PRD-F13 | Correction by an unrelated party | Signed-in freelancer with no relation files a correction on someone else's log | 404; nothing created |
| S-23 | PRD-F6 | Empty record | Client with no published experiences in the past 12 months | "No published experiences in the past 12 months"; no score, no zero stars, no safe or never-reviewed wording |
| S-24 | PRD-F6 | Expired log leaves the record | Log passes 12 months after original publication | Hidden from visible history and excluded from the average on every read, even before the maintenance run |
| S-25 | PRD-F2 | Bad period or negative amount | Period end before period start, or amount -100 centavos | Rejected with the offending field named; nothing stored |
| S-26 | PRD-F12 | Withdrawn log leaves the record immediately | Published log withdrawn after an upheld correction | Gone from visible history and the average at once; the row and proofs purge at the inherited original-publication 12-month deadline |
| S-27 | PRD-F12 | Abandoned ask-changes and abandoned update cleanup | Unpublished log idle in `ask_changes` for 30 days; proposed update to a published log idle for 30 days | Unpublished log purged with its proofs after its case is closed as abandoned; abandoned update purges only the unapproved revision and its proofs while the active publication keeps its original deadline |
| S-28 | PRD-F12 | Erasure before expiry recalculates | Filer name must be erased while the published log is inside its 12-month term | Affected record hidden or withdrawn and the average recalculated; never an anonymous publication |
| S-29 | PRD-F12 | Raw DELETE of unexpired content blocked | Direct SQL DELETE of an unexpired decided revision, tag, or proof row | Trigger rejects: DELETE allowed only to the maintenance path past the retention deadline with no hold |
| S-30 | PRD-F12 | Hold blocks an eligible purge | Expired row under an active review or legal hold presented to the maintenance run | Physical purge refused while the hold applies; the row stays hidden from reads and rating regardless |
| S-31 | PRD-F7 | Session revocation write fails | Real signed-in client signs out while D1 session DELETE aborts; restore writes and retry | HTTP 503 and generic SESSION_REVOCATION_FAILED, no false success/redirect/cookie clearing, existing session retryable; successful retry revokes copied-cookie access |
| S-32 | PRD-F1 | Missing identity inputs | Submit without real account/profile name or a portfolio link | Field errors, no request/case/audit/profile-pending change; no extra name approval is requested |
| S-33 | PRD-F1 | Invalid inspection tuple or approval | Direct D1 write with partial inspection, name_match 2/fraction/text, approval before inspection, fail result, or name mismatch | Database rejects each invalid state; no verified profile grant; legitimate complete failed inspection can close with reasoned rejection |
| S-34 | PRD-F4 | Stale lease, empty reason or wrong decision kind | Inspect/decide/release with stale claimant or expired lease; decide with whitespace reason, ask-changes or correction-only decision on verification | Conflict/validation failure and no mutation, no audit-only success; verification permits only approve/reject; a bare admin has no moderator bypass |
| S-35 | PRD-F1 | Mid-batch failure | Abort request or decision SQL with a D1 trigger after another statement would have written | Entire batch rolls back: no orphan request/case/event, no partial close and no profile grant; retry is possible |
| S-38 | PRD-F1 | Rejected request retains history | Reject before or after inspection, correct name/city/portfolio and submit again; reopen the old review | Old request/inspection/decision/reason and original submitted snapshot stay immutable; new request captures corrected inputs. Legacy originals stay unavailable; only an undecided legacy case may show separately labelled current inputs for fresh inspection. One undecided request; verified/suspended accounts cannot reopen this initial workflow |

## 4. Abuse cases

| ID | PRD-F# | Vector | Attempt | Expected defense |
|----|--------|--------|---------|------------------|
| AB-01 | PRD-F1 | Forged verification | Freelancer submits reviewer/result/decision/claim fields, or another user's request id | Request action accepts only owner request inputs; moderator evidence/decision path refuses non-moderators; no forged verification grant |
| AB-02 | PRD-F1 | One person, many accounts | Moderator recognizes the same individual attempting a second account from permitted live review evidence | Moderator can reject with a reason; no stored ID hash/number/image, phone proof or automatic cross-account identity matching is introduced |
| AB-03 | PRD-F2 | Second log on one engagement | Call `submitLog` twice for the same engagement | Second rejected by UNIQUE `engagement_id` |
| AB-04 | PRD-F2 | Free-text tag | Post a tag value "Scammer" directly to the action | Rejected by Zod and by the CHECK constraint |
| AB-05 | PRD-F3 | Upload to someone else's log | Freelancer B posts a file to A's draft log id | 404; nothing written to R2 |
| AB-06 | PRD-F3 | Upload after submission | Add proof to a `pending` log | 409; the proof set is frozen (uploads allowed again only in `ask_changes`) |
| AB-07 | PRD-F4 | Self-review | Moderator who is the filer, or who has an engagement with the client, tries to claim | Claim refused with a conflict reason |
| AB-08 | PRD-F4 | Non-moderator decides | Freelancer calls the moderation decision action `decideReview` | 404 |
| AB-09 | PRD-F5 | (Retired) Reply as another client | Retired 2026-10-13 with PRD-F5 | N/A |
| AB-10 | PRD-F6 | Enumerate client ids | Signed-in user requests 200 sequential or random ids in a minute | Rate limited; ids are random, not sequential |
| AB-11 | PRD-F6 | Script injection in facts | Facts contain `<script>` and an `onerror` image tag | Rendered as text; no script runs |
| AB-12 | PRD-F7 | Role escalation | Client sets `role=moderator` in a sign-up or profile update payload | Field ignored; role unchanged |
| AB-13 | PRD-F8 | Skip onboarding | New account requests `/clients` directly | Redirected to onboarding; data actions refuse |
| AB-14 | PRD-F9 | Reuse an invite | Accept the same link from a second client account | Refused; engagement already accepted |
| AB-15 | PRD-F9 | Self-invite | Freelancer opens their own invite link to play both sides | Refused by the handler; the client account must differ from the freelancer account |
| AB-16 | PRD-F10 | (Retired) Pile-on | Retired 2026-10-13 with PRD-F10 | N/A |
| AB-17 | PRD-F3 | Path traversal | Proof file name `../../etc/passwd` | Object key is generated server-side; the client file name is never used in the key |
| AB-18 | PRD-F13 | Client edits a publication directly | Client account calls a log, tag, or proof mutation, or runs a raw SQL update on published facts | Actions return 404; frozen triggers reject the update |
| AB-19 | PRD-F13 | Conflicted correction reviewer | Original log decider, the filer, the client, or an engaged freelancer tries to decide the correction | Refused: the reviewer must be independent and unconflicted |
| AB-20 | PRD-F3 | Admin proof bypass | Admin without a moderator permission or persona requests `/api/proofs/[id]` | 404, same as any unrelated user |
| AB-21 | PRD-F2 | Backdated anchor | Anchor moved earlier to fit the window, or proof does not support the claimed event date | Rejected on evidence mismatch; no clock reset is possible |
| AB-22 | PRD-F12 | Probe a purge endpoint | Unauthenticated request guessing a maintenance or purge URL | 404: no public purge endpoint exists; retention runs on the system Cron identity only |
| AB-23 | PRD-F1 | ID image upload | Verification attempt attaches an ID photo or number file | Rejected; nothing stored, logged, or returned |
| AB-24 | PRD-F12 | Cascade wipe through USER delete | Direct delete of a USER row that still owns unexpired logs, proofs, or unexpired minimal history | Refused by FK RESTRICT; closure deactivates instead and purges only per the assessed plan |
| AB-25 | PRD-F7 | Forged or rejected logout request | Submit foreign/missing origin, foreign callback, malformed body or corrupted signature while a valid session exists | Existing router/body validation remains authoritative; no valid session is revoked by rejected requests or a forged signature |
| AB-26 | PRD-F1 | Concurrent requests and reviewed-name substitution | Submit two simultaneous requests; change reviewed name/portfolio while one is open | Partial unique request rule admits one complete request transaction; review inputs cannot change underneath inspection; no verified-name edit bypass |
| AB-27 | PRD-F4 | Concurrent claim/decision | Two moderators claim one row; winner and stale claimant race decisions/release; repeat completed decision | Exactly one live claimant and one close; losers' zero-row updates create no event/profile/subject changes; immutable closed history; actual current role/ban/conflict rechecked |
| AB-28 | PRD-F4 | Self/conflicted review | Subject attempts verification self-review; future log/correction reviewer is filer/client/engaged with client or original decider for correction | Claim and decision rejected; verification handler cannot activate future kinds; no admin bypass |
| AB-31 | PRD-F4 | Audit injection and history edit | Client supplies actor/action/content, then directly updates/deletes audit or decided case evidence outside maintenance | Actor/action server-owned, no content column; append-only/immutability protections reject edits; retained history exposes no raw request body or ID data |
| AB-32 | PRD-F7 | Reset and credential creation against passwordless accounts | Call dedicated/deprecated/generic OTP reset send/check/create, core token reset with valid/wrong/expired proof, server-only password setup, account create/update hooks and HTTP password sign-in/signup | Password operations denied before credential or auth-verification mutation and send callback; existing sign-in proof remains usable; ordinary OTP sign-in and optional Google configuration stay intact |
| AB-33 | PRD-F9 | Concurrent consent and rejected-actor nonmutation | Race two client accepts and accept versus decline/cancel; inject receipt failure; repeat with stale/banned/wrong/self actor and expired invite | One atomic winner and one fresh engagement-linked consent; losers change no profile/acceptance/engagement; failure rolls all batch writes back; unauthorized expiry probes never change rows |
| AB-35 | PRD-F9 | Cross-tab response target confusion | Render invite A, continue B in another tab, then submit stale A accept (including first-profile fields) and decline; also send missing/malformed/duplicate target and missing/malformed cookie | Reject before mutation, preserve newer cookie B; both invitations remain invited; matching B acceptance and ordinary decline work; rendered target is a nonsecret ID, never the cookie hash or raw token |
| AB-34 | PRD-F9, PRD-F7, PRD-F8 | Invite continuation redirect abuse | Supply external URL, protocol-relative path, encoded/token-bearing path, fragment, duplicate returnTo or stale pending capability; sign in and acknowledge current policies | Only fixed /invite/continue is retained; invalid input goes to /home; bearer token never enters auth URLs or client storage; engagement consent stays a separate unchecked choice |
| AB-36 | PRD-F7 | Per-network OTP send quota | From one synthetic trusted network request codes for20distinct addresses, then a21st; repeat from another network | First20 succeed,21st returns429 and Retry-After; a different network succeeds. Browser scenarios isolate network buckets without disabling actual application throttling |

### 4.1 Negative tests (invariants)

| ID | INV-# | Attempt to break the rule | Expected |
|----|-------|---------------------------|----------|
| NT-01 | INV-1 | Signed-in freelancer with no relation fetches a `pending` log through the record page and the query layer directly | Not present in the page; query returns nothing |
| NT-02 | INV-1 | Attempt publication through every non-moderation path: `submitLog`, filer update, correction request, and direct action calls | None publishes; only the moderation decision action `decideReview` may set `published` (log publication handling is planned, not built) |
| NT-03 | INV-2 | Submit a log with zero proof files, bypassing the form | Rejected by the handler; a raw SQL update to `pending` is rejected by the proof trigger |
| NT-04 | INV-2 | Submit a log on an engagement in `invited` or `declined` state | Rejected |
| NT-05 | INV-3 | Attempt sensitive name/image payloads through OTP signup, update-user and provider-backed user hooks; ID/QR/phone-derived request/reason/inspection payloads; then legitimate manual inspection; inspect D1/R2 and captured logs | Recognizable raw payloads reject before writes without mutation/content logging. Provider HTTP image values are discarded whole, including hidden payloads. Only validated owner-entered snapshot/profile/portfolio and permitted inspection evidence persist; ordinary numeric project URLs work. No ID upload/transcription or content-bearing audit event |
| NT-06 | INV-4 | Request `/api/proofs/[id]` as an unrelated signed-in user, as a bare admin without a moderator persona, as a signed-out visitor, and with a guessed R2 URL | 404 in every case (or sign-in redirect); no public endpoint |
| NT-07 | INV-5 | Scan the schema and record UI for score, rank, leaderboard, endorsement, trust-badge, or best/worst ordering fields and text, while seeding ratings 1 and 5 | None found; only the approved 1-5 rating and its client average render, with no competitive ordering |
| NT-08 | INV-6 | Client account calls any log, tag, or proof mutation for a log about them, and runs a raw SQL update on a published log's facts | Actions return 404; frozen triggers reject the update |
| NT-09 | INV-7 | Signed-out request to `/clients/[id]` and `/clients?q=`; request with a crawler user agent | Redirect to sign-in; no record content in the response; `X-Robots-Tag: noindex` present |
| NT-10 | INV-8 | Unverified freelancer, and verified freelancer missing the current policy acceptance, each call `createEngagement`, `saveLogDraft`, `submitLog`, `submitFilerUpdate` | All refused |
| NT-11 | INV-1 | Read a record holding published, hidden, withdrawn, and expired logs as an unrelated signed-in freelancer | Only published non-expired logs appear; the rest are absent from the page, the query, and the average |
| NT-12 | INV-5 | Ten approved logs from one freelancer about one client, plus one from another; withdraw, hide, expire, reject, or leave pending the latest of a pair with an older eligible log; file a pending then rejected update to a still-published log | The pair contributes exactly one rating (the latest eligible, falling back to the older one); a pending or rejected update never changes the active approved rating; unapproved signals never appear |

## 5. Coverage matrix

Every Must-Have has at least one case in each class. PRD-F5 and PRD-F10 are Retired and excluded from required coverage; their old case IDs stay reserved and are never reused.

| PRD-F# | Happy | Sad | Abuse |
|--------|-------|-----|-------|
| PRD-F1 | H-01, H-24 | S-01, S-02, S-32, S-33, S-35, S-38 | AB-01, AB-02, AB-23, AB-26 |
| PRD-F2 | H-02, H-19 | S-03, S-04, S-16, S-17, S-18, S-19, S-25 | AB-03, AB-04, AB-21 |
| PRD-F3 | H-03 | S-05, S-06 | AB-05, AB-06, AB-17, AB-20 |
| PRD-F4 | H-04, H-12, H-25 | S-07, S-08, S-34 | AB-07, AB-08, AB-27, AB-28, AB-31 |
| PRD-F5 | Retired (H-05, S-09, AB-09 reserved) | — | — |
| PRD-F6 | H-06, H-11 | S-10, S-23, S-24 | AB-10, AB-11 |
| PRD-F7 | H-07, H-23, H-26 | S-11, S-31 | AB-12, AB-25, AB-32, AB-34, AB-36 |
| PRD-F8 | H-08 | S-12 | AB-13, AB-34 |
| PRD-F9 | H-09 | S-13, S-14 | AB-14, AB-15, AB-33, AB-34, AB-35 |
| PRD-F10 | Retired (H-10, S-15, AB-16 reserved) | — | — |
| PRD-F12 | H-17, H-18, H-21, H-22 | S-24, S-26, S-27, S-28, S-29, S-30 | AB-22, AB-24 |
| PRD-F13 | H-13, H-14 | S-20, S-21, S-22 | AB-18, AB-19 |
| PRD-F14 | H-15, H-16, H-20 | S-03 | AB-18 |

### 5.1 Invariant coverage

| INV-# | Negative tests |
|-------|----------------|
| INV-1 | NT-01, NT-02, NT-11 |
| INV-2 | NT-03, NT-04 |
| INV-3 | NT-05 |
| INV-4 | NT-06 |
| INV-5 | NT-07, NT-12 |
| INV-6 | NT-08 |
| INV-7 | NT-09 |
| INV-8 | NT-10 |

### 5.2 Metric verification

| Metric | Target (PRD §5) | Verified by |
|--------|-----------------|-------------|
| FLAG-M1 | 100 percent of stored logs from verified accounts | Query in H-01; NT-10 guards the gate |
| FLAG-M2 | 100 percent of submitted logs with proof | H-03; NT-03 attempts the zero-proof path |
| FLAG-M3 | At least 90 percent of cases decided within 48 hours | H-04 timestamps reviewed weekly |
| FLAG-M4 | Retired (was reply availability) | N/A |
| FLAG-M5 | 20 to 30 pilot participants Nov 29 - Dec 12, 2026 | Account counts at pilot close |
| FLAG-M6 | Descriptive outcome distribution, no quota | H-16 plus S-18/S-19 outcome mix reported without a target |
| FLAG-M7 | Retired (was corroboration rate) | N/A |
| FLAG-M8 | At least 80 percent pilot satisfaction | QA survey at pilot close |
| FLAG-M9 | 100 percent of filing accounts on the current policy version | H-08; NT-10 attempts filing without it |
| FLAG-M10 | 100 percent of published logs rated; averages equal the mean of latest eligible ratings with counts | H-15, H-11, H-20; NT-12 checks one-pair-one-vote with fallback and unchanged active rating under pending/rejected updates |
| FLAG-M11 | At least 90 percent of corrections decided by an independent moderator within 48 hours | H-13 timestamps reviewed weekly; AB-19 guards independence |
| FLAG-M12 | Expired records removed on schedule; all holds documented | S-24 expiry reads; S-26 withdrawn deadline; S-27 abandoned cleanup; H-21 closure without cascade; maintenance log plus hold register reviewed weekly |

## 6. Not tested

| Area | Why not tested | Risk accepted by |
|------|---------------|------------------|
| Liveness: the person presenting is the ID holder beyond the live inspection | A remote inspection can still be spoofed; the portfolio trail and moderator judgment are the mitigation | slvdrvncntjvr (owner, 2026-10-13) |
| Load beyond pilot scale | Pilot is 20-30 users | slvdrvncntjvr (owner, 2026-10-13) |
| iOS Safari below 16 | Not in the pilot device mix | slvdrvncntjvr (owner, 2026-10-13) |
| Malware inside PDFs | No scanner on the free stack; PDFs are opened only by moderators in the browser's PDF viewer | slvdrvncntjvr (owner, 2026-10-13) |

Proofs are served as generated-name attachments with no inline PDF rendering. There is no malware scanner, so the accepted PDF malware risk above still applies.

## 7. Release gate

- [ ] All Must-Have happy cases pass
- [ ] All Must-Have sad cases pass
- [ ] All abuse cases pass or have a signed-off exception in §6
- [ ] All invariant negative tests pass; no exceptions allowed
- [ ] No secrets in test fixtures


### 7.1 Owner manual acceptance worksheet (prepared 2026-10-27)

Use dev only. For each check, record the date, device and browser, and pass or fail with the failing step. Do not record codes, cookies, session tokens, ID images or ID numbers, or ID-derived names. Local synthetic browser checks never fill owner rows. Recheck a changed release instead of carrying acceptance forward. Android Chrome and desktop are the acceptance devices (IDEA §5); iPhone Safari and Messenger checks are optional.

| Check | Steps and pass condition | Result |
|-------|--------------------------|--------|
| Mobile, verification and queue observation (PRD-F7, PRD-F8, PRD-F1, PRD-F4) | Owner reports these working on mobile. Capture device/browser and exact workflow when testing the next release; queue operation alone does not establish genuine live inspection. | Owner-reported working on existing dev; detailed acceptance incomplete |
| Real inbox (PRD-F7) | Sign in to the tested dev candidate with the selected mailbox; privately read the email code, return to FLAG and sign in. Record approximate delivery delay and browser, never the code. | Owner-reported working on existing dev; delivery timing/browser unspecified; recheck changed release |
| Android Chrome (PRD-F7, PRD-F8, PRD-F1) | Sign in, explicitly accept any current notices, open Home/Verification, submit an owner-entered name and portfolio request once, then sign out. Check keyboard, scrolling, links and no clipped controls. Signed-out private routes return to sign-in. | Pending |
| iPhone Safari (PRD-F7, PRD-F8, PRD-F1) | Repeat Android steps; switching to the inbox and back preserves the sign-in flow. Record physical device and Safari/iOS versions. | Optional, not a gate |
| Messenger browser (PRD-F7) | Open the dev link inside Messenger on each available phone, sign in and navigate; record any limitation and verify opening in external Chrome/Safari as the recovery path. A Messenger banner stays an undecided PRD §6 candidate (LOG Q27). | Optional, not a gate; untested by owner |
| Actual moderator inspection (PRD-F1, PRD-F4; INV-3) | Freelancer uses slvdrvncntjvr@gmail.com; moderator uses iamadislikebutton@gmail.com in a separate session. Submit/claim a request, genuinely inspect a supported government ID live without capture, record only the allowed method/result/name-match/time, then approve with a reason. Confirm freelancer status changes correctly. | Explicitly untested by owner |
| Rejection and correction (PRD-F1, PRD-F4) | Use a separate genuine request; reject with a reason, submit a corrected new request, confirm old inputs/inspection/decision remain in history, then inspect and decide the new request. Never fabricate an inspection just to advance the screen. | Explicitly untested by owner |
| Engagement invite (PRD-F9; once deployed) | A verified/current-policy freelancer creates an invite. In another session a client signs in/registers, explicitly acknowledges consent and accepts; confirm both parties see the accepted engagement. Check decline separately, expired/reused link rejection, and no negative rating or warning for refusal. | Pending |
| Cloudflare usage (IDEA §6 Cost) | During the pilot and before enabling intake, open the Cloudflare dashboard and check Workers, D1 and R2 usage. Stop and ask the owner before any paid upgrade. | Pending |

Main promotion needs green CI and the owner's explicit go-ahead. GitHub branch protection stays as configured in GitHub. This worksheet does not authorize production mutation.
