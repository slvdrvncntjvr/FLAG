---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.50
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-11-01
reconciled: 2026-10-13
---

# Verification and acceptance: FLAG

**Requirements:** [PRD](prd-flag.md). **Contracts:** [SDD](sdd-flag.md).
**Availability:** [INDEX](index.md#6-current-development-baseline).

## 1. Strategy

The cases below are the durable product acceptance plan. A listed case does not
mean its feature exists or that it passed. Existing automated suites cover auth,
onboarding, manual verification/review/history, engagement consent and private
initial log/proof intake through pending. Log publication, client records,
full retention, closure/export and independent correction/update acceptance
remain unimplemented.

| Area | Existing executable evidence |
|------|------------------------------|
| Accounts, mail and policies | web/tests/auth-*.test.ts, mail-provider.test.ts, nt-10-onboarding-gate.test.ts; web/e2e/accounts.spec.ts |
| Verification and shared review | web/tests/f01-*.test.ts, f04-verification-queue.test.ts, verification-*.test.ts, moderation-reclaim.test.ts; web/e2e/verification.spec.ts |
| Engagements, consent, redirects and tab targets | web/tests/f09-*.test.ts; web/e2e/engagements.spec.ts; Node invite-return tests |
| Private initial intake and migrations | web/tests/f02-*.test.ts, f03-*.test.ts, migration-preservation.test.ts; web/e2e/log-intake.spec.ts |
| Setup, binding/CI guards and harness isolation | web/scripts/*.test.mjs; scripts/test_spine.py |

Required regression boundaries: disabled intake works on schema 0008 without new
writes or 0009-field reads; enabled synthetic intake uses 0009. Submitted content
stays frozen and cannot publish. R2 integrity, hold-aware cleanup, exclusive
purge ownership, compensation races and batch rollback need existing negative
coverage. Recognizable government IDs, including MID/member aliases and encoded
variants, reject on first save and edit without database writes; legitimate
dates/amounts/contributions/project MIDs remain accepted. Verification snapshots
stay immutable and legacy NULL stays unknown. Browser scenarios use independent
synthetic network buckets while actual application OTP limits remain enabled.

Privacy repair regressions reject government-labelled portfolio URL numbers on
first/corrected submission without changing user/profile/portfolio/request/review/
audit rows or emitting their content. Include composed account/identification/
number labels and encoded hostname/query/path/fragment variants. Unicode-host
cases must reject before punycode hides ID digits, including valid alternate
authority separators and stripped control whitespace; safe IDNs remain valid.
Decoding stays bounded
and fails closed at its limit. Ordinary numeric project URLs and numbers split
across separate query parameters remain valid: one key's label cannot supply
context to another key's value. Regression location:
`web/tests/verification-labelled-urls.test.ts:12`.
Auth regressions deny the unused check-only OTP operation before proof lookup or
mutation for HTTP and server APIs, preserve supported sign-in/verification and
password-route denials, and sanitize adapter/hook failures at all console levels
and client boundaries. Logout failure must retain its truthful retry path.

Consent regressions include the exact A/B-tab profile-creation race with A's
capability restored before stale A submission, simultaneous first-profile forms,
and transaction rollback leaving no partial profile/receipt/audit effects. Browser
coverage must reject the stale form, reload to show the actual profile and require
fresh unchecked association/consent at both configured viewports. Same-reviewer
release/expiry reclaim may reuse earlier inspection with a current lease;
different reviewers must personally reinspect before approval.

New-client-profile regressions reject missing, empty and whitespace-only city
through both handler and actual action without profile/consent/engagement/audit
writes or clearing the pending invite. Valid creation stores trimmed city with
optional registration; existing profiles, including legacy NULL-city profiles,
remain reusable with explicit association and no profile edit or backfill.
These checks do not make freelancer verification city required. Locations:
`web/tests/f09-consent-profile.test.ts:47`, `web/tests/f09-engagements.test.ts:69`.

Explicit-removal regressions in `web/tests/f03-proof-removal*.test.ts` revoke
authority after the final read but before claim, race holds/submission/removals,
inject later-statement failures and assert no losing activity/claim/R2 effects.
After a committed authorized claim, deletion may finish despite later revocation;
automatic recovery must still work without refreshing activity. Verify the
30-day inactivity boundary and preserve crashed-owner, late-put, integrity and
held/submitted-evidence protections. Metadata tooling must preserve original
SQL/snapshot hashes, produce no unchanged-schema migration and generate only
the intended next numbered change in a disposable copy.

Lifecycle checks exercise actual owned Windows processes, queued natural exit
around taskkill, already-closed roots, output destroyed before close, descendants,
spawn/termination failure and idempotent stop. Uncertain closure or port release
must fail and retain owned data. Full packaged/browser acceptance requires the
command to exit 0 and report verified teardown, free ports and removed temporary
data; passing browser assertions alone is insufficient. Historical E2E causation
remains distinct from the confirmed smoke race. Audit full and production
dependency graphs separately; do not suppress incompatible development-tool
advisories to obtain a misleading clean result.

Run commands in BUILD. The CI workflow at .github/workflows/baseline.yml runs
TypeScript for app/tests/E2E, lint, Workers tests, Node deployment/setup tests,
Worker build, packaged local workerd smoke, no-upload packaging, isolated
browser tests and dependency audits. Main-target CI additionally packages and
smokes production. Canonical SPINE validation/checkpoints are local gates;
hosted CI tests the pinned runner but cannot access the private engine.

Run relevant existing checks for the change; full candidate CI coverage is the
release gate. A prose/copy repair does not create a new release checklist.
Local tests do not establish independent review, real mail/OAuth, physical-device
behavior or owner acceptance. Historical run receipts stay in the old log;
current verification evidence belongs once in the current LOG/task report.

## 2. Happy path cases

| ID | PRD-F# | Scenario | Expected |
|----|--------|----------|----------|
| H-01 | PRD-F1 | Freelancer completes verification: Complete a manual live ID inspection (supported ID plus portfolio link) with a moderator; moderator records reviewer, method, result, name-match, and time, then approves | Profile status `verified` with identity-checked meaning (never a trustworthiness guarantee); freelancer can create an engagement |
| H-02 | PRD-F2 | File a log with a rating: On an accepted engagement choose rating 2, tags Late Payment and Unresponsive, period, 60-character facts, no amount, one proof, submit | Log status `pending` with the amount empty; a `log` moderation case exists; rating stored 2 with derived outcome Negative |
| H-03 | PRD-F3 | Attach proof: Add one PNG and one PDF under 10 MB | Both listed with kind and size; both stored in R2 under the log's prefix |
| H-04 | PRD-F4 | Approve a log: Moderator claims the oldest case, opens proof, approves with a reason on a real project whose key claims the proof supports | Log `published` with original `published_at` and expiry set; audit has claim and decision; feature notifications are optional PRD-F11 |
| H-05 | PRD-F5 | (Retired) Client replies: Retired 2026-10-13 with PRD-F5; no public reply path is tested | N/A |
| H-06 | PRD-F6 | Read a client record: Signed-in freelancer searches the client name and opens the record | Average to one decimal with contributor count, outcome counts, tag counts, and published logs newest first with filer names and approved dated update metadata only |
| H-07 | PRD-F7 | Sign in/create account: request and use an email code | Session created; new account reaches onboarding before choosing role and accepting policies |
| H-08 | PRD-F8 | Accept policies: New account reads and accepts the privacy notice, terms, and three freelancer statements | Acceptance rows stored with the current versions; app pages reachable |
| H-09 | PRD-F9 | Handshake: Client explicitly associates and consents using a new profile with city, or an existing profile including legacy NULL city | Engagement `accepted`, `client_id` set, fresh `client_consent` acceptance stored; new city trimmed, registration optional; reused profile unchanged |
| H-10 | PRD-F10 | (Retired) Corroborate: Retired 2026-10-13 with PRD-F10; no same-experience path is tested | N/A |
| H-11 | PRD-F6 | Limited record counts people, not logs: Client with five published logs from two distinct contributors | Shows the average with count 2 and the Limited record label; all five logs readable |
| H-12 | PRD-F4 | Ask-changes preserves eligibility: Moderator asks-changes on a log whose first submission was complete and on time; filer resubmits corrections after the 15-day deadline | Resubmission continues the same log; no new filing and no clock reset; first-submitted and anchor dates unchanged |
| H-13 | PRD-F13 | Client correction is corrected: Named client files a private correction with counter-proof; an independent unconflicted moderator corrects | New revision published with approved dated update metadata; original `published_at` and expiry unchanged; private request and counter-proof never shown to readers |
| H-14 | PRD-F13 | Filer posts a later-dated update: Filer submits a paid-late update with proof for their own published log; moderator approves the revised content and rating | New approved revision shown with its date; original publication date still anchors retention |
| H-15 | PRD-F14 | First average from the first contributor: First approved log for a client (rating 4) | Record shows the average with contributor count 1 and the Limited record label |
| H-16 | PRD-F14 | Positive log may carry a risk tag: Rating 5 with tag Late Payment and supporting proof; moderator approves | Published Positive; the tag shows beside it; no tag combination overrides the star-derived outcome |
| H-17 | PRD-F12 | Data request resolved: User files an export request; admin resolves with the outcome recorded | Request `done` with its outcome; no blanket data retention promised |
| H-18 | PRD-F12 | Account close assessed: User requests account closure | Assessed individually within 30 days; outcome recorded; surviving records follow the approved lifecycle |
| H-19 | PRD-F2 | File a log with covered period and optional amount: On an accepted engagement choose rating 4, tags On-time Payment, covered work start/end dates within the engagement, amount 50000 centavos, 60-character facts, one proof, submit | Log `pending` with period_start/period_end and amount_centavos stored; rating stored 4 with derived outcome Positive |
| H-20 | PRD-F14 | Older published contribution survives a newer rejected log: Pair has an older published log (rating 5); filer files a second log on a newer engagement that is rejected | Average still counts the older 5 with the contributor retained; the rejected log contributes nothing |
| H-21 | PRD-F12 | Account close deactivates without cascade: User with a published log inside its 12-month term requests closure; admin closes after assessment | Account deactivated with access revoked and sessions gone; published log, proofs, and consent history retained to their deadlines; no USER cascade wipe |
| H-22 | PRD-F12 | Maintenance purges expired eligible rows: Expired published log past its 12-month deadline with no hold; run the maintenance function | Eligible rows and their R2 objects purged through the ordered protocol; parents only after eligible children |
| H-23 | PRD-F7 | Durable logout and replay rejection: Sign in, retain the original cookie, sign out successfully, then replay it; repeat logout and concurrent retries | Session row removed, cookie cleared, replay has no session; repeated/concurrent valid logout remains idempotent |
| H-24 | PRD-F1 | Pending request through live inspection: Freelancer captures account/profile name and portfolio, submits; moderator claims, records actual live inspection and approves with reason | Before inspection all five evidence fields NULL, exactly one open case and profile pending; inspection alone grants nothing; decision atomically verifies profile and closes both rows with matching decision/time and ids-only audit |
| H-25 | PRD-F4 | Release and expired-claim recovery: Claim verification, release, reclaim; expire lease, then let another moderator reclaim and reinspect | Each successful transition audited; leases last 30 minutes; different reviewer cannot decide from predecessor's inspection; original evidence never attributed to new reviewer |
| H-26 | PRD-F7 | Email-code sign-in survives passwordless hardening: Request and use an ordinary email sign-in code after denied password operations; inspect stored account fields | Sign-in succeeds; no password credential or hash is created; optional configured Google provider remains configured |

## 3. Sad path cases

| ID | PRD-F# | Scenario | Expected |
|----|--------|----------|----------|
| S-01 | PRD-F1 | Wrong email code: Three wrong codes | Each rejected with "Code is incorrect"; further attempts rate limited |
| S-02 | PRD-F1 | Name on ID differs: Live inspection passes but the ID name does not match the account name | Case records name-match false; moderator decides with a reason; profile stays `pending` until decided |
| S-03 | PRD-F2 | Out-of-range or fractional rating: Rating 0, 6, or 2.5 | Rejected: rating must be an integer from 1 to 5; the DB CHECK (`typeof(rating) = 'integer'`) rejects 2.5 even past the handler; nothing stored |
| S-04 | PRD-F2 | Missing fields, amount omitted: No period, facts of 10 characters, no amount | Period and facts named in field errors; missing amount is fine; nothing stored |
| S-05 | PRD-F3 | Oversized file: 12 MB JPEG | 413; message states the 10 MB limit |
| S-06 | PRD-F3 | Wrong type: `.exe` renamed to `.pdf` | Rejected by signature check |
| S-07 | PRD-F4 | Decide without a reason: Moderator clicks Approve with an empty reason | Blocked: reason required |
| S-08 | PRD-F4 | Claimed by someone else: Second moderator opens a claimed case | Read-only, shows who holds it and until when |
| S-09 | PRD-F5 | (Retired) Reply too long: Retired 2026-10-13 with PRD-F5 | N/A |
| S-10 | PRD-F6 | No match: Search for a name no client has | "No registered client matches" with a hint that clients join through an engagement invite |
| S-11 | PRD-F7 | Expired code: Email code used after expiry | Rejected; option to send a new code |
| S-12 | PRD-F8 | Policy version changed: Policy version bumped while a user is signed in | Next page load shows the acceptance screen again |
| S-13 | PRD-F9 | Expired invite: Open a link after 14 days | Expiry is shown; viewing an expired link does not itself authorize mutation |
| S-14 | PRD-F9 | Client declines: Client chooses Decline | Engagement `declined`; freelancer cannot start a log for it; no warning or negative signal shown anywhere |
| S-15 | PRD-F10 | (Retired) Duplicate corroboration: Retired 2026-10-13 with PRD-F10 | N/A |
| S-16 | PRD-F2 | Filing deadline boundary, Asia/Manila: Anchor 1 April: submit 16 April, then submit 17 April | 16 April accepted; 17 April rejected as late; no extra grace |
| S-17 | PRD-F2 | Future anchor: Anchor date after the submission date | Rejected: the event cannot be in the future |
| S-18 | PRD-F2 | Ask-changes on missing context: Log claims a real project but key claims lack supporting proof | Moderator asks-changes with the missing context named; log not published |
| S-19 | PRD-F2 | Reject on unsupported claims: Log with no real project behind it | Moderator rejects with reasons; rejected material kept 30 days after the final decision |
| S-20 | PRD-F13 | Second open correction: Correction request filed while one is already open on the same log | Rejected: one open request per log |
| S-21 | PRD-F13 | Repeat without new evidence: New request after a decided one with no new evidence or uploads | Rejected: repeats need new evidence |
| S-22 | PRD-F13 | Correction by an unrelated party: Signed-in freelancer with no relation files a correction on someone else's log | 404; nothing created |
| S-23 | PRD-F6 | Empty record: Client with no published experiences in the past 12 months | "No published experiences in the past 12 months"; no score, no zero stars, no safe or never-reviewed wording |
| S-24 | PRD-F6 | Expired log leaves the record: Log passes 12 months after original publication | Hidden from visible history and excluded from the average on every read, even before the maintenance run |
| S-25 | PRD-F2 | Bad period or negative amount: Period end before period start, or amount -100 centavos | Rejected with the offending field named; nothing stored |
| S-26 | PRD-F12 | Withdrawn log leaves the record immediately: Published log withdrawn after an upheld correction | Gone from visible history and the average at once; the row and proofs purge at the inherited original-publication 12-month deadline |
| S-27 | PRD-F12 | Abandoned ask-changes and abandoned update cleanup: Unpublished log idle in `ask_changes` for 30 days; proposed update to a published log idle for 30 days | Unpublished log purged with its proofs after its case is closed as abandoned; abandoned update purges only the unapproved revision and its proofs while the active publication keeps its original deadline |
| S-28 | PRD-F12 | Erasure before expiry recalculates: Filer name must be erased while the published log is inside its 12-month term | Affected record hidden or withdrawn and the average recalculated; never an anonymous publication |
| S-29 | PRD-F12 | Raw DELETE of unexpired content blocked: Direct SQL DELETE of an unexpired decided revision, tag, or proof row | Trigger rejects: DELETE allowed only to the maintenance path past the retention deadline with no hold |
| S-30 | PRD-F12 | Hold blocks an eligible purge: Expired row under an active review or legal hold presented to the maintenance run | Physical purge refused while the hold applies; the row stays hidden from reads and rating regardless |
| S-31 | PRD-F7 | Session revocation write fails: Real signed-in client signs out while D1 session DELETE aborts; restore writes and retry | HTTP 503 and generic SESSION_REVOCATION_FAILED, no false success/redirect/cookie clearing, existing session retryable; successful retry revokes copied-cookie access |
| S-32 | PRD-F1 | Missing identity inputs: Submit without real account/profile name or a portfolio link | Field errors, no request/case/audit/profile-pending change; no extra name approval is requested |
| S-33 | PRD-F1 | Invalid inspection tuple or approval: Direct D1 write with partial inspection, name_match 2/fraction/text, approval before inspection, fail result, or name mismatch | Database rejects each invalid state; no verified profile grant; legitimate complete failed inspection can close with reasoned rejection |
| S-34 | PRD-F4 | Stale lease, empty reason or wrong decision kind: Inspect/decide/release with stale claimant or expired lease; decide with whitespace reason, ask-changes or correction-only decision on verification | Conflict/validation failure and no mutation, no audit-only success; verification permits only approve/reject; a bare admin has no moderator bypass |
| S-35 | PRD-F1 | Mid-batch failure: Abort request or decision SQL with a D1 trigger after another statement would have written | Entire batch rolls back: no orphan request/case/event, no partial close and no profile grant; retry is possible |
| S-38 | PRD-F1 | Rejected request retains history: Reject before or after inspection, correct name/city/portfolio and submit again; reopen the old review | Old request/inspection/decision/reason and original submitted snapshot stay immutable; new request captures corrected inputs. Legacy originals stay unavailable; only an undecided legacy case may show separately labelled current inputs for fresh inspection. One undecided request; verified/suspended accounts cannot reopen this initial workflow |

## 4. Abuse cases

| ID | PRD-F# | Scenario | Expected defense |
|----|--------|----------|------------------|
| AB-01 | PRD-F1 | Forged verification: Freelancer submits reviewer/result/decision/claim fields, or another user's request id | Request action accepts only owner request inputs; moderator evidence/decision path refuses non-moderators; no forged verification grant |
| AB-02 | PRD-F1 | One person, many accounts: Moderator recognizes the same individual attempting a second account from permitted live review evidence | Moderator can reject with a reason; no stored ID hash/number/image, phone proof or automatic cross-account identity matching is introduced |
| AB-03 | PRD-F2 | Second log on one engagement: Call `submitLog` twice for the same engagement | Second rejected by UNIQUE `engagement_id` |
| AB-04 | PRD-F2 | Free-text tag: Post a tag value "Scammer" directly to the action | Rejected by Zod and by the CHECK constraint |
| AB-05 | PRD-F3 | Upload to someone else's log: Freelancer B posts a file to A's draft log id | 404; nothing written to R2 |
| AB-06 | PRD-F3 | Upload after submission: Add proof to a `pending` log | 409; the proof set is frozen (uploads allowed again only in `ask_changes`) |
| AB-07 | PRD-F4 | Self-review: Moderator who is the filer, or who has an engagement with the client, tries to claim | Claim refused with a conflict reason |
| AB-08 | PRD-F4 | Non-moderator decides: Freelancer calls the moderation decision action `decideReview` | 404 |
| AB-09 | PRD-F5 | (Retired) Reply as another client: Retired 2026-10-13 with PRD-F5 | N/A |
| AB-10 | PRD-F6 | Enumerate client ids: Signed-in user requests 200 sequential or random ids in a minute | Rate limited; ids are random, not sequential |
| AB-11 | PRD-F6 | Script injection in facts: Facts contain `<script>` and an `onerror` image tag | Rendered as text; no script runs |
| AB-12 | PRD-F7 | Role escalation: Client sets `role=moderator` in a sign-up or profile update payload | Field ignored; role unchanged |
| AB-13 | PRD-F8 | Skip onboarding: New account requests `/clients` directly | Redirected to onboarding; data actions refuse |
| AB-14 | PRD-F9 | Reuse an invite: Accept the same link from a second client account | Refused; engagement already accepted |
| AB-15 | PRD-F9 | Self-invite: Freelancer opens their own invite link to play both sides | Refused by the handler; the client account must differ from the freelancer account |
| AB-16 | PRD-F10 | (Retired) Pile-on: Retired 2026-10-13 with PRD-F10 | N/A |
| AB-17 | PRD-F3 | Path traversal: Proof file name `../../etc/passwd` | Object key is generated server-side; the client file name is never used in the key |
| AB-18 | PRD-F13 | Client edits a publication directly: Client account calls a log, tag, or proof mutation, or runs a raw SQL update on published facts | Actions return 404; frozen triggers reject the update |
| AB-19 | PRD-F13 | Conflicted correction reviewer: Original log decider, the filer, the client, or an engaged freelancer tries to decide the correction | Refused: the reviewer must be independent and unconflicted |
| AB-20 | PRD-F3 | Admin proof bypass: Admin without a moderator permission or persona requests `/api/proofs/[id]` | 404, same as any unrelated user |
| AB-21 | PRD-F2 | Backdated anchor: Anchor moved earlier to fit the window, or proof does not support the claimed event date | Rejected on evidence mismatch; no clock reset is possible |
| AB-22 | PRD-F12 | Probe a purge endpoint: Unauthenticated request guessing a maintenance or purge URL | 404: no public purge endpoint exists; retention runs on the system Cron identity only |
| AB-23 | PRD-F1 | ID image upload: Verification attempt attaches an ID photo or number file | Rejected; nothing stored, logged, or returned |
| AB-24 | PRD-F12 | Cascade wipe through USER delete: Direct delete of a USER row that still owns unexpired logs, proofs, or unexpired minimal history | Refused by FK RESTRICT; closure deactivates instead and purges only per the assessed plan |
| AB-25 | PRD-F7 | Forged or rejected logout request: Submit foreign/missing origin, foreign callback, malformed body or corrupted signature while a valid session exists | Existing router/body validation remains authoritative; no valid session is revoked by rejected requests or a forged signature |
| AB-26 | PRD-F1 | Concurrent requests and reviewed-name substitution: Submit two simultaneous requests; change reviewed name/portfolio while one is open | Partial unique request rule admits one complete request transaction; review inputs cannot change underneath inspection; no verified-name edit bypass |
| AB-27 | PRD-F4 | Concurrent claim/decision: Two moderators claim one row; winner and stale claimant race decisions/release; repeat completed decision | Exactly one live claimant and one close; losers' zero-row updates create no event/profile/subject changes; immutable closed history; actual current role/ban/conflict rechecked |
| AB-28 | PRD-F4 | Self/conflicted review: Subject attempts verification self-review; future log/correction reviewer is filer/client/engaged with client or original decider for correction | Claim and decision rejected; verification handler cannot activate future kinds; no admin bypass |
| AB-31 | PRD-F4 | Audit injection and history edit: Client supplies actor/action/content, then directly updates/deletes audit or decided case evidence outside maintenance | Actor/action server-owned, no content column; append-only/immutability protections reject edits; retained history exposes no raw request body or ID data |
| AB-32 | PRD-F7 | Reset and credential creation against passwordless accounts: Call dedicated/deprecated/generic OTP reset send/check/create, core token reset with valid/wrong/expired proof, server-only password setup, account create/update hooks and HTTP password sign-in/signup | Password operations denied before credential or auth-verification mutation and send callback; existing sign-in proof remains usable; ordinary OTP sign-in and optional Google configuration stay intact |
| AB-33 | PRD-F9 | Concurrent consent and invalid creation: Race two accepts and accept versus decline/cancel; inject receipt failure; submit new-profile fields without city or with blank city; repeat with stale/banned/wrong/self actor and expired invite | One atomic winner and fresh engagement-linked consent; invalid city and rejected actors change no profile/acceptance/engagement/audit; batch failure rolls back; unauthorized expiry probes never change rows |
| AB-35 | PRD-F9 | Cross-tab response target confusion: Render invite A, continue B in another tab, then submit stale A accept (including first-profile fields) and decline; also send missing/malformed/duplicate target and missing/malformed cookie | Reject before mutation, preserve newer cookie B; both invitations remain invited; matching B acceptance and ordinary decline work; rendered target is a nonsecret ID, never the cookie hash or raw token |
| AB-34 | PRD-F9, PRD-F7, PRD-F8 | Invite continuation redirect abuse: Supply external URL, protocol-relative path, encoded/token-bearing path, fragment, duplicate returnTo or stale pending capability; sign in and acknowledge current policies | Only fixed /invite/continue is retained; invalid input goes to /home; bearer token never enters auth URLs or client storage; engagement consent stays a separate unchecked choice |
| AB-36 | PRD-F7 | Per-network OTP send quota: From one synthetic trusted network request codes for20distinct addresses, then a21st; repeat from another network | First20 succeed,21st returns429 and Retry-After; a different network succeeds. Browser scenarios isolate network buckets without disabling actual application throttling |

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

PRD section 5 defines all FLAG-M metrics, including retired IDs. Use the matching
feature acceptance cases and actual case timestamps, current policies, eligible
published ratings, hold register and confirmed deletion outcomes. Pilot account
counts and QA survey establish participation/satisfaction. Do not claim real
operational measurements from synthetic fixtures or count a hidden row as erased.

## 6. Not tested

| Area | Boundary |
|------|----------|
| Unimplemented workflows | Their acceptance and invariant cases remain required for the feature delivery; current suites cannot establish them |
| Live mail / configured Google | Synthetic tests do not establish provider/inbox/OAuth behavior |
| Human acceptance and physical devices | Desktop/mobile Chromium is automated evidence only |
| Deployed bindings and migrations | Local builds and fixtures are not a remote inspection |
| Full privacy lifecycle | A receiving email address and draft cleanup do not establish assessed requests, closure, correction or full physical deletion |

Existing negative tests cover applicable implemented boundaries; future
publication/record/correction cases become executable with those workflows.
No Active invariant is waived.

## 7. Release gate

Green CI plus owner manual smoke of the intended shipped slice. Minimum safe
lifecycle/correction capabilities precede real proofs/publication. No new
billing, release-identity, recovery-drill, device/Messenger or approval gates are
introduced by this document.

### 7.1 Owner manual acceptance

No new owner acceptance is claimed by the consolidation. For the next intended
release, record the date, environment, tested revision and actual outcome of:
email sign-in, current-policy onboarding, verification/review and engagement
accept/decline; include private logging/records only when that slice is ready.
Record observed issues rather than filling a blank checklist with assumed passes.
