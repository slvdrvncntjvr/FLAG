---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.11
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-21
reconciled: 2026-10-13
---

# QA & Test Plan: FLAG

**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. Strategy

2026-10-21 five-repair milestone (PRD-F7/PRD-F8): `web/tests/mail-provider.test.ts:1` passes nine focused Workers cases: Resend acceptance and unchanged sender/message, status-only errors without reading/logging private synthetic response bodies, native AbortSignal timeout cancellation for both providers with the test delay shortened to zero, Brevo priority and sender parsing, no fallback after Brevo rejection, and no-provider sent:false. All 85 Workers cases across five files, 25 Node checks, and three Python runner tests pass. Full lint, app/test/E2E typechecks, and the OpenNext dev Worker build pass. The first milestone used Node 24.8.0. The owner-approved follow-up pins 24.22.1; its clean install, all 85 Workers cases, 25 Node checks, three Python runner tests, app/test/E2E typechecks, lint, Worker build and dev deployment dry run also pass. All six desktop/360px Chromium cases also pass on Node 24.22.1; the complete runner exits zero and leaves no port-3000 listener, owned server process, or test temporary directory.

Correction to earlier typecheck claims: the tests project inherited the app exclusion, so earlier successful commands skipped the tests. `web/tests/tsconfig.json:7` now overrides exclude; all five test files are included. The corrected check exposed TS2345 at `web/tests/f02-schema.test.ts:162`, repaired with precise metadata typing. `web/e2e/tsconfig.json:1` separately checks the browser spec and Playwright config. Browser coverage in `web/e2e/accounts.spec.ts:1` uses real localhost console OTP account creation, D1 sessions, both account roles, current policy acknowledgments, the pre-onboarding gate, reload persistence, and successful logout with replay of the revoked cookie rejected. Fault injection covers aborted sends/verifications, returned server/incorrect/expired/rate-limit verification errors, and returned or thrown sign-out errors that retain the session and allow retry. Anonymous redirects/noindex and horizontal-overflow assertions cover desktop and 360px. The mobile sign-out alert initially overflowed; the account header now wraps and the error occupies its own row, without weakening assertions. Chromium verification passes all six cases across desktop and 360px mobile; the complete runner exits zero. Post-run checks found no port-3000 listener, owned E2E/server process, or flag-e2e temporary directory. The isolated harness uses synthetic credentials and fresh local D1/R2; no real mail, Google OAuth, deployed Worker, or later workflow coverage is claimed.

Earlier baseline maintenance (before this 85-case milestone): `web/tests/auth-repairs.test.ts:12` adds four email-delivery regressions: failed callback returns HTTP 503 with a generic code, concurrent success/failure and retry stay isolated, Brevo quota/server rejection is reported without exposing its body, and a network timeout is reported through a bounded request. No real mail is sent. That earlier repair brought the Workers suite to 76 cases; earlier counts below describe their dated milestones. Deployment/audit coverage stays at 25 Node tests. `scripts/test_spine.py:1` separately checks the pinned 0.3.0 engine runner, exit-code propagation, Unicode output, snapshot cleanup, and refusal to run an unavailable version. Run pinned documentation checks with `python scripts/spine.py check docs/` and `python scripts/spine.py checkpoint verify` from the repo root. These changes repair PRD-F7 reliability and reproducibility, without claiming new product workflows or browser E2E coverage.

2026-10-21 deployment follow-up: 25 Node checks pass across `web/scripts/check-ci-target.test.mjs:1` and `web/scripts/r2-audit.test.mjs:1`. Eight added regressions run the actual guard scripts, exercise each Wrangler config's custom-build command with conflicting inherited environments, cover positional/flag/environment precedence and malformed values, and test live DB/auth/PROOFS metadata. Missing/swapped/incorrectly typed proof bindings, missing DB/auth values, duplicate names, and unavailable metadata all fail. Both Cloudflare D1 ID metadata forms are accepted. The shared live validator is used by the R2 audit and dev release verifier. These are local checks; no fresh live resource or billing observation is claimed.

Final local verification for that follow-up: all 72 Workers-pool application tests, lint, app/test typechecks, the full OpenNext dev Worker build, and an actual Wrangler dev deployment dry run pass. The dry run invokes the dev custom-build command and reports flag-db-dev, flag-proofs-dev, and the dev authentication URL, then exits without upload. The existing configuration-drift regression also rejects a missing database ID or the production ID paired with the dev database name. Initial build/dry-run attempts hit sandbox parent-directory/log-path permissions; approved reruns outside the sandbox passed. Live metadata/route/billing checks were not rerun.

2026-10-21 R2 follow-up: `web/scripts/check-ci-target.test.mjs:1` and `web/scripts/r2-audit.test.mjs:1` pass 17 Node tests, including account-ID pinning, account-wide operation totals, per-bucket peak aggregation including deleted buckets, conservative unknown-operation handling, invalid/truncated analytics, private Standard bucket settings, and lifecycle/import hazards. Live CLI resource inspection found both empty buckets private/Standard and active Worker DB/auth bindings isolated. The live audit explicitly returns warnings for current 403 billing/notification access and unclassified metadata operations; it does not claim a verified $0 invoice, configured email alert, or a hard/runtime spending cap. Historical counts below retain their observation dates.

- **Automated, integration (implemented):** Vitest in the Cloudflare Workers pool with local D1 migrations applied per test file and local R2 PROOFS at `web/vitest.config.mts:13`. Auth/onboarding tests exist in web/tests/nt-10-onboarding-gate.test.ts and web/tests/auth-repairs.test.ts. The case tables below are the target plan, not a claim that every case is automated or passes. Pull-request automation is configured separately.
- **Issue #5 schema foundation:** `web/tests/f02-schema.test.ts:1` tests direct D1 writes for PRD-F2, PRD-F3, and PRD-F14: integer ratings and derived outcome, canonical ordered dates, optional integer centavos, fixed tags, unique engagement/reference/revision/object key, restrictive foreign keys, same-log revision ownership, and proof metadata limits. This covers the database portions of S-03, S-25, H-16, and INV-5/NT-07; form errors, publication, UI, uploads, protected streaming, and the full end-to-end cases remain planned. All five migrations also apply to a fresh standalone local D1 database.
- **Issue #5 storage foundation:** `web/tests/f03-storage.test.ts:1` verifies streamed R2 put/get with matching D1 metadata and idempotent object deletion that leaves retry metadata available; these are primitives, not the future upload authorization or retention runner. The full Workers suite passes 69 tests across four files. `web/scripts/check-ci-target.test.mjs:1` passes nine Node deployment tests, including actual Wrangler configs and missing/swapped/remote-preview proof binding rejection plus database/auth/Worker regression cases. No remote bucket privacy or live proof-route test is claimed.
- **2026-10-21 audit fixes (branch fix-otp-limit-log-parties):** `web/tests/auth-repairs.test.ts` adds a per-IP code-email cap across different addresses (21st send returns 429) and IPv6 /64 collapsing (a sixth send from a rotated address in one /64 returns 429; another /64 is unaffected); both fail against the previous limiter. `web/tests/f02-schema.test.ts` adds rejection of a log whose freelancer or client differs from its engagement's parties, on insert and update. Test clients in `web/tests/helpers.ts` now use distinct /64 prefixes so library limits do not leak between tests. The Workers suite passes 72 tests across four files.
- **Automated, end-to-end:** Playwright auth/onboarding cases for PRD-F7/PRD-F8 exist at desktop and 360px through `web/scripts/e2e.mjs:1`. Chromium verification passes all six cases across desktop and 360px mobile; the complete runner exits zero. PRD-F9, PRD-F2 with PRD-F3, PRD-F4, PRD-F6 with PRD-F14, and PRD-F13 remain planned with their workflows.
- **Manual (QA team):** a weekly test pass on a mid-range Android phone in Chrome and in the Messenger in-app browser, following the H cases for the features delivered that week. Results go in the course tracker.
- **Pilot (Nov 29 - Dec 12):** usability survey for FLAG-M8, owned by QA.
- **Deliberately untested:** see §6.

**Runner:** npm test and npm run test:e2e from web/. The browser command invokes `web/scripts/e2e.mjs:1`. Chromium verification passes all six cases across desktop and 360px mobile; the complete runner exits zero.
**Location:** `web/tests/`, `web/e2e/`, invariant tests named `web/tests/nt-<nn>-*.test.ts`

cr-001 regression coverage: incomplete freelancer acknowledgment changes neither role nor acceptance history; a failed policy insert rolls back the role; concurrent duplicate onboarding creates one current acceptance per policy; expired and reused OTPs are rejected; staff-role input is refused; cross-origin OTP requests are refused; missing mail fails outside localhost; D1 admits exactly five concurrent attempts across limiter instances, keeps hashed identifiers, separates IP+email buckets and send/verify buckets, and resets after fifteen minutes. S-11 now actually tests expiry; the former wrong-code test remains separately. NT-10 tests the fail-closed verification guard. AB-13's real onboarding-route redirect remains an integration/E2E release check, not claimed by that pure guard test.

2026-10-14 dev release smoke checks passed via web/scripts/verify-dev-release.mjs: actual DB/auth bindings, landing/sign-in/legal/anonymous-session routes, signed-out /home and /onboarding redirects to /sign-in, noindex headers, policy versions 2026-10-14, and the sixth invalid-code attempt returning 429 with a retry delay. These check the anonymous access boundary; they do not claim a full signed-in AB-13 flow or a human email-delivery/onboarding UI pass.

cr-001 deployment checks: npm run test:deploy runs six Node tests in web/scripts/check-ci-target.test.mjs:8. They reject the legacy default deploy to flag-dev, production operations from a dev commit, and selecting dev for the production Worker; accept the correct combinations; check CLI/environment precedence and passthrough flags; and preserve intentional local manual deploys. These supplement the 21 Workers-pool application tests.

Wrangler dry runs with WORKERS_CI=1 and WORKERS_CI_BRANCH=dev also confirmed actual plain default deploys to both CI targets (flag and flag-dev) are rejected by the custom build before upload. The first experiment showed adapter-only protection did not catch plain Wrangler; the custom-build check closes that path.

## 2. Happy path cases

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

## 4. Abuse cases

| ID | PRD-F# | Vector | Attempt | Expected defense |
|----|--------|--------|---------|------------------|
| AB-01 | PRD-F1 | Forged verification | Non-moderator posts verification-case fields directly to the action | 404; only the moderator path writes cases |
| AB-02 | PRD-F1 | One person, many accounts | Same individual completes live inspection for a second account | Moderator review surfaces the duplicate; second case rejected with a reason |
| AB-03 | PRD-F2 | Second log on one engagement | Call `submitLog` twice for the same engagement | Second rejected by UNIQUE `engagement_id` |
| AB-04 | PRD-F2 | Free-text tag | Post a tag value "Scammer" directly to the action | Rejected by Zod and by the CHECK constraint |
| AB-05 | PRD-F3 | Upload to someone else's log | Freelancer B posts a file to A's draft log id | 404; nothing written to R2 |
| AB-06 | PRD-F3 | Upload after submission | Add proof to a `pending` log | 409; the proof set is frozen (uploads allowed again only in `ask_changes`) |
| AB-07 | PRD-F4 | Self-review | Moderator who is the filer, or who has an engagement with the client, tries to claim | Claim refused with a conflict reason |
| AB-08 | PRD-F4 | Non-moderator decides | Freelancer calls `decideCase` | 404 |
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

### 4.1 Negative tests (invariants)

| ID | INV-# | Attempt to break the rule | Expected |
|----|-------|---------------------------|----------|
| NT-01 | INV-1 | Signed-in freelancer with no relation fetches a `pending` log through the record page and the query layer directly | Not present in the page; query returns nothing |
| NT-02 | INV-1 | Attempt publication through every non-moderation path: `submitLog`, filer update, correction request, and direct action calls | None publishes; only `decideCase` sets `published` |
| NT-03 | INV-2 | Submit a log with zero proof files, bypassing the form | Rejected by the handler; a raw SQL update to `pending` is rejected by the proof trigger |
| NT-04 | INV-2 | Submit a log on an engagement in `invited` or `declined` state | Rejected |
| NT-05 | INV-3 | Complete a live inspection, then search the D1 export, R2 listing, captured Worker logs, and audit rows for ID digits, ID names, or image bytes | No match anywhere; only reviewer, method, kind, result, name-match, and time are recorded |
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
| PRD-F1 | H-01 | S-01, S-02 | AB-01, AB-02, AB-23 |
| PRD-F2 | H-02, H-19 | S-03, S-04, S-16, S-17, S-18, S-19, S-25 | AB-03, AB-04, AB-21 |
| PRD-F3 | H-03 | S-05, S-06 | AB-05, AB-06, AB-17, AB-20 |
| PRD-F4 | H-04, H-12 | S-07, S-08 | AB-07, AB-08 |
| PRD-F5 | Retired (H-05, S-09, AB-09 reserved) | — | — |
| PRD-F6 | H-06, H-11 | S-10, S-23, S-24 | AB-10, AB-11 |
| PRD-F7 | H-07 | S-11 | AB-12 |
| PRD-F8 | H-08 | S-12 | AB-13 |
| PRD-F9 | H-09 | S-13, S-14 | AB-14, AB-15 |
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

## 7. Release gate

- [ ] All Must-Have happy cases pass
- [ ] All Must-Have sad cases pass
- [ ] All abuse cases pass or have a signed-off exception in §6
- [ ] All invariant negative tests pass; no exceptions allowed
- [ ] No secrets in test fixtures
