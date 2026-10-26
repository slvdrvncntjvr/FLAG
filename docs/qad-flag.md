---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.31
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-27
reconciled: 2026-10-13
---

# QA & Test Plan: FLAG

**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. Strategy

Release preparation refresh,2026-10-27 (Asia/Manila), base db74ce2 plus the documented recovery-publication changes: all seventeen Python runner/recovery safety cases pass; the unchanged application passes a fresh production OpenNext build, exact production configuration guard, Wrangler no-upload package and ten anonymous packaged-workerd route checks with synthetic isolated D1/R2 and400/400/400/400/400/429 invalid-code responses. No mail was sent. Full and omit-dev dependency audits both report zero vulnerabilities. Ignored release-preparation production-build/smoke/dry-run and audit logs retain the observations. These are local production-target packaging checks, not a new live production application or full authenticated/device acceptance. OPS section7 retains the draft-promotion checklist and exact-version verification requirement after any dev publication.

The tables below define the approved product and invariant test plan; a planned case is not evidence that the full workflow exists. Current implemented scope is auth/onboarding plus manual verification and shared review/audit, with log/proof schema/storage primitives. INDEX section 6 records the verified PR17 dev release and local checkpoint. LOG retains historical run counts and failures rather than duplicating them here.

Owner-approved 2026-10-26 regression scope: standard-auth user create/update rejects recognizable ID-number/name or image payloads before persistence (INV-3/NT-05); ordinary numeric portfolio project URLs succeed while marked/encoded ID payloads still reject; corrected new requests retain immutable case-specific name/city/portfolio snapshots; legacy snapshots remain unknown rather than fabricated. Additive 0007 preserves existing rows/triggers and rejects snapshot mutation. H-24/H-25, S-38 and applicable abuse/negative tests cover this repair; privacy/terms reacceptance uses current POLICY_VERSIONS and S-12. Desktop/360px cases must exercise reject, corrected resubmission and reopening the original review as well as the approval path.

Required candidate evidence: exact lockfile installation, app/test/E2E typechecks, lint, Workers integration/negative tests, deployment/release/setup Node tests, Python runner/recovery tests, desktop/mobile browsers, actual dev and production-target builds/guards/no-upload packaging, and isolated packaged workerd smoke. The dev release verifier must cover all ten anonymous baseline/F1 routes, current legal/noindex rules and invalid-code throttling, bracketing probes with the independently mapped exact active version at 100 percent. These checks do not send mail or prove deployed authenticated inspection, OAuth, physical devices or recovery.

Local repair evidence, 2026-10-26: final npm run typecheck, npm run lint and npm test -- --maxWorkers=1 pass (333 Workers across 17 files); test:deploy passes 42 Node cases plus five setup checks, and ten Python runner/recovery tests pass. Both dependency audits report zero vulnerabilities, with manifest/lock unchanged. Both target Worker builds, binding guards, no-upload dry runs and ten-route packaged smoke pass; gzip is approximately 1740.6 KiB. Expanded test:e2e exits zero with all twelve desktop/360px cases in 4.7 minutes, including actual reject/resubmit/reopen and numeric project forms. The first new history scenario captured the queue URL before client navigation; explicit detail-URL/heading synchronization repaired the test, with all historical-value assertions retained and per-project names isolated.

Fresh independent Orca app/migration review (ctx_ad8fc043e865) finds all three original reproductions closed and no blocker; independent release/docs review and recheck (ctx_481c4dc83bf5, ctx_4a4d58850034) resolved a stale-policy false-positive and stale SDD status. The shared probe now requires the matching displayed legal title and current Version marker, excluding comments/scripts and swapped pages; 17 focused identity cases pass after that fix. A final minor legacy-unavailable copy correction avoids claiming why malformed evidence is missing; its three existing display regressions pass. Auth and verification implementers observed red-before-green cases and migration preservation/rollback; published 0000-0006 SQL/meta, dependency pins, eight invariants, policy-ack versions and reconciled dates are unchanged. Review scope is source/probes, not production or real Google callback acceptance.

Hosted acceptance: reviewed source cdcdc50 and merged dev 45540d8 both pass verify/dependency-audit in runs 40287087925 and 40287906609, including a clean exact-lock installation and full twelve-case browser suite on Linux. Cloudflare build ad814386 maps the merge to Worker 1e1c2440-1ce1-484b-abee-e7c3558000a1; exact-version verification passes correct bindings, ten anonymous routes, displayed current policy titles/versions, invalid-code throttling and unchanged 100 percent version identity. Dev0007 pre/postflight preserves original rows/schema, leaves legacy snapshots NULL, installs fourteen total triggers and has clean FKs; a recovery bookmark was captured without a restoration drill. Local checkpoint spine-cp-2026-10-26-1 captures 45540d8 after those gates. A documentation-only follow-up may trigger the same application's redeployment; its exact-version result is recorded on that PR.

Canonical SPINE 0.3.0 normal validation/checkpoint verification pass locally; strict validation retains three error groups (historical/deferred LOG/RFC markers and unchecked human INDEX health items) and two planned-entity warnings. No strict/full-product acceptance, authenticated deployed government-ID inspection, actual remote restore, physical-device, real OAuth or production release is claimed.

Production-preparation local evidence, 2026-10-26, base db74ce2 plus uncommitted rehearsal tooling: `python scripts/production_migration_rehearsal.py` passes with Node 24.22.1 and Wrangler 4.149.0 at script SHA-256 d7805bfa5e576c73ee6505ed6bc4f4dd4dbd073906d52107349e015461e18c30. Both rich and sparse auth-only fixtures upgrade from 0002 through unchanged 0003-0007 with every original auth row preserved, staged schema/ledger/FK checks and fourteen final triggers. Pre0003/post0007 local restores compare exact schema SQL, rows, ledger, columns and FKs; fresh installation matches the upgraded schema and reapplication is an exact no-op. The 183-command report records cleanup of all owned temporary state. Seven new safety tests and all seventeen Python tests pass, including dependency-absent execution matching CI's pre-install ordering. Compatibility probes execute inspected old-main SQL shapes, not the complete old Worker or real authentication/mail.

The raw Wrangler export cannot import unchanged when a child's data precedes its parent table. The passing local restore reorders the exact statement multiset, preserving all values and internal line endings; it never disables D1 foreign keys or changes published migrations. An earlier failed rerun exposed CRLF/LF conversion in the tool, which was repaired with a retained regression; prior failed/older reports remain local evidence. This local result does not establish remote restore acceptance. The saved remote drill failed before any completed restore stage; the corrected diagnostic helper has independent source review, but automatic approval review rejected its resumed execution pending explicit approval for production-backup data in a new temporary remote D1 database. Production migration, Time Travel/R2 recovery, a fresh paused backup and deployed acceptance remain gated in OPS section 7 and LOG Q26.

Later 2026-10-26 approved recovery evidence supersedes that pending-permission state: LOG Q26 is resolved. Remote ingestion requires parent data before child data across commits; an independently reviewed exact-statement topological derivative now passes production-backup import, all original schema/row hashes and the isolated DB's own Time Travel recovery, with FK checks and verified owned-database deletion (13:59:41-14:00:09UTC). The private production proof bucket also passes synthetic320-byte put/get/delete/restore/exact-SHA/final404 at14:09UTC; eight offline safety scenarios pass. This is recovery mechanics evidence, not actual proof backup or authenticated application acceptance.

Focused real local D1 verification confirms every newly created/rebuilt0003-0007 raw schema SQL and all columns/FKs match its local expectations. Eleven unchanged base objects differ only in LF versus fresh-Windows-checkout CRLF. The production operation below retains the exact observed original base SQL and compares new objects against exact installed-Wrangler wire SQL, with published migration bytes unchanged. Local raw SQL alone did not establish that remote normalization behavior; the controlled0004 stop and independent correction are retained in OPS section7/LOG.

Production SQL acceptance,2026-10-26: the single write pause is14:21:10.133-14:28:46.526UTC (456393ms), including a safely stopped0004 formatting postflight and independently reviewed same-pause continuation. Wrangler's installed remote-command normalizer converts unquoted CRLF toLF while preserving quoted values; exact wire expectations, original migration hashes and original base SQL now bind remote comparison. No arbitrary schema normalization or file rewrite is used. All0003-0007 migration steps pass original-auth/schema/ledger preservation, columns/FKs and expected empty-feature checks, with eight ledger rows/fourteen permanent triggers, no fabricated snapshots and exact no-op reapplication. Fresh paused encrypted export/bookmark and exact all-row/schema/column/FK comparison pass; all fifteen temporary guards are confirmed removed and owned OS-temp state is gone. The complete receipt isSHA25658ffadc4e66c646efdd73e120527a11e183818300d638be28d471bdfe6d394b0, resumed source703604364e9671f5834e295f6962e11ea3f18cae7f6c846e5a004f413b1770a6, base db74ce2 plus local tooling. Fresh read-only postflight agrees with the final frozen state. Seven anonymous routes pass on the unchanged production Worker9b1fdc1d at100percent, with old deployed2026-10-12 legal versions and no email/sign-in. Independent postflight review accepts this bounded database operation; application promotion/full-product/physical-device/authenticated F1 acceptance remain separate.

---

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
| AB-25 | PRD-F7 | Forged or rejected logout request | Submit foreign/missing origin, foreign callback, malformed body or corrupted signature while a valid session exists | Existing router/body validation remains authoritative; no valid session is revoked by rejected requests or a forged signature |
| AB-26 | PRD-F1 | Concurrent requests and reviewed-name substitution | Submit two simultaneous requests; change reviewed name/portfolio while one is open | Partial unique request rule admits one complete request transaction; review inputs cannot change underneath inspection; no verified-name edit bypass |
| AB-27 | PRD-F4 | Concurrent claim/decision | Two moderators claim one row; winner and stale claimant race decisions/release; repeat completed decision | Exactly one live claimant and one close; losers' zero-row updates create no event/profile/subject changes; immutable closed history; actual current role/ban/conflict rechecked |
| AB-28 | PRD-F4 | Self/conflicted review | Subject attempts verification self-review; future log/correction reviewer is filer/client/engaged with client or original decider for correction | Claim and decision rejected; verification handler cannot activate future kinds; no admin bypass |
| AB-31 | PRD-F4 | Audit injection and history edit | Client supplies actor/action/content, then directly updates/deletes audit or decided case evidence outside maintenance | Actor/action server-owned, no content column; append-only/immutability protections reject edits; retained history exposes no raw request body or ID data |

### 4.1 Negative tests (invariants)

| ID | INV-# | Attempt to break the rule | Expected |
|----|-------|---------------------------|----------|
| NT-01 | INV-1 | Signed-in freelancer with no relation fetches a `pending` log through the record page and the query layer directly | Not present in the page; query returns nothing |
| NT-02 | INV-1 | Attempt publication through every non-moderation path: `submitLog`, filer update, correction request, and direct action calls | None publishes; only `decideCase` sets `published` |
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
| PRD-F7 | H-07, H-23 | S-11, S-31 | AB-12, AB-25 |
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
