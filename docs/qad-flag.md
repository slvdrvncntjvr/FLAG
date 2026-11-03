---
spine_type: QAD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.57
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-11-03
reconciled: 2026-10-13
---

# Verification and acceptance: FLAG

**Requirements:** [PRD](prd-flag.md). **Contracts:** [SDD](sdd-flag.md).
**Availability:** [INDEX](index.md#6-current-development-baseline).

## 1. Strategy

The cases below are the durable product acceptance plan. A listed case does not
mean its feature exists or that it passed. Existing automated suites cover auth,
onboarding, manual verification/review/history, engagement consent and private
initial log/proof intake through pending. The pilot feature branch now adds log
publication, client records, full retention, assessed closure/export and
independent correction/update suites. Final integrated and deployed acceptance
remain separate from source implementation; INDEX owns their delivery state.

The owner on 2026-11-02 authorizes the remaining pilot implementation on dev
under Review docs. The owner's report that signup, verification and moderation
work on dev is bounded to that existing slice; it does not accept the cases
below. New intake stays disabled during implementation. OPS owns backed-up dev
migration/deployment and later synthetic intake; main promotion needs the
owner's later approval. No optional feature or paid upgrade is included.

The dev intake flag is global to eligible verified users, not a synthetic-only
allowlist. Keep the synthetic test window under staff control and do not
verify/admit real proof filers; if existing eligible real users cannot be kept
outside that scope, leave intake disabled and resolve containment with the
coordinator. Separate manual acceptance precedes real pilot proof collection.

| Area | Existing executable evidence |
|------|------------------------------|
| Accounts, mail and policies | web/tests/auth-*.test.ts, mail-provider.test.ts, nt-10-onboarding-gate.test.ts; web/e2e/accounts.spec.ts |
| Verification and shared review | web/tests/f01-*.test.ts, f04-verification-queue.test.ts, verification-*.test.ts, moderation-reclaim.test.ts; web/e2e/verification.spec.ts |
| Engagements, consent, redirects and tab targets | web/tests/f09-*.test.ts; web/e2e/engagements.spec.ts; Node invite-return tests |
| Private initial intake and migrations | web/tests/f02-*.test.ts, f03-*.test.ts, migration-preservation.test.ts; web/e2e/log-intake.spec.ts |
| Human log review, private correction and filer updates | web/tests/f04-log-review.test.ts, f13-corrections.test.ts, f13-updates.test.ts; web/e2e/pilot-review.spec.ts |
| Private records, search and ratings | web/tests/f06-records.test.ts, f06-record-review-integration.test.ts |
| Assessed lifecycle, physical erasure and closed-account access | web/tests/f12-*.test.ts, pilot-migration.test.ts; web/e2e/pilot-privacy.spec.ts |
| Setup, binding/CI guards, encrypted backup and harness isolation | web/scripts/*.test.mjs; scripts/test_spine.py, scripts/test_backup_d1.py |

Required regression boundaries: disabled intake works on schema 0008 without new
writes or 0009-field reads in its supported read-only query paths. The new
Worker auth/schema requires the current reviewed migrations before deployment
(OPS section 7); deployed baseline ledgers are recorded in INDEX. Baseline 0009
denies publication; the reviewed 0011 protocol
permits it only through complete human review. Submitted content stays frozen. R2 integrity, hold-aware cleanup, exclusive
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

### 1.1 Execute the remaining acceptance cases

Requirements come from PRD section 3.1; SDD owns concrete fields, operators and
time arithmetic. Use disposable local D1/R2 fixtures first, then authorized dev
synthetics. Future handlers/test files are not executable evidence until built.
Never seed publication by weakening production guards: create accepted
engagements, complete submissions and approve through the actual moderator
transition. A test-only clock/fixture may set boundary timestamps in isolated
data. Advance database time as well as the application clock; mocking Date alone
cannot test SQL `now`. Compare fresh server reads, rendered responses and R2
object existence after each transition; do not rely on a stale page.

Use five verified/current-policy freelancers, two distinct client accounts with
the same display name, two independent moderators, a moderator engaged with the
target client, an unrelated account, a bare admin, a suspended account and a
signed-out browser. Every proof/counter-proof is synthetic and contains no ID or
real person's information. Record before/after row counts and selected immutable
values, captured content-free events, private object keys and actual object
existence in isolated test assertions; do not put secret URLs or proof contents
in reports. For race cases pause immediately before conditional write/claim,
apply the competing change, resume, and assert one complete winner with zero
losing writes. Inject a later SQL/R2 failure and retry to prove recovery rather
than only testing successful concurrency.

For every date selector, test just before, exactly at and just after its
deadline. Use a normal anniversary (original publication 2026-11-02T00:00:00Z,
expiry 2027-11-02T00:00:00Z), plus SDD section 3.8's clamped UTC anniversaries:
2024-02-29T10:15:00.000Z becomes 2025-02-28T10:15:00.000Z and
2026-01-31T10:15:00.000Z becomes 2027-01-31T10:15:00.000Z. Preserve milliseconds;
SQL and app helper must agree. Twelve months is not a fixed 365-day duration.
Test elapsed-UTC 30-day selectors separately from the 15-day
filing boundary across Asia/Manila midnight. At expiry, fresh record/history/
average reads exclude the item even when maintenance is stopped or a hold is
active. Physical deletion requires its separate D1/R2 assertions.

### 1.2 Pilot coverage responsibilities

| Work | Required cases | Recommended delivery owner |
|------|----------------|----------------------------|
| Full lifecycle, request assessment, export and maintenance | H-17/H-18/H-21/H-22/H-27/H-28, S-26–S-30/S-39–S-42, AB-22/AB-24/AB-37/AB-38 | Lifecycle implementer: Workers integration, migration and R2 failure/race tests; operator verifies dev scheduling and backup disposition |
| Log queue, rounds and human publication | H-04/H-12/H-29, S-07/S-08/S-43, AB-27/AB-28/AB-31/AB-39 | Moderation implementer: transactional integration and actual action tests; QA adds browser flow |
| Independent correction and approved filer updates | H-13/H-14/H-30, S-20–S-22/S-44, AB-18/AB-19/AB-40 | Correction implementer: actor/conflict, proof, round, rollback and revision-selection tests; QA adds private browser flow |
| Private search, record and rating eligibility | H-06/H-11/H-15/H-16/H-20/H-31/H-32, S-10/S-23/S-24/S-45, AB-10/AB-11/AB-41/AB-42 | Record implementer: query/aggregate tests; QA verifies display and unauthorized responses |
| Cross-slice invariants and migrations | NT-13–NT-20 plus existing NT-01–NT-12, H-33 | Each affected implementer owns its regression; coordinator integrates and checks whole candidate |

The executable pilot suites are listed in section 1. Source existence is not a
passing run; the coordinator integrates independent reviews, focused results and
final candidate CI, while deployed operation and manual acceptance remain
separate. Existing auth/verification/handshake/intake suites stay
regression coverage for PRD-F1/F2/F3/F7/F8/F9. PRD-F11 remains optional/deferred;
retired features and PRD section 6 candidates are excluded.

### 1.3 Retention repair acceptance, 2026-11-03

These confirmed PRD-F12 regressions supplement the existing lifecycle cases;
they are required expectations, not passing deployed evidence. Focused checks,
independent rereview and candidate CI are separate from hosted workflows;
INDEX owns current delivery state and section 1.4 records hosted observations.

| Confirmed defect | Existing acceptance | Required focused regression |
|------------------|---------------------|-----------------------------|
| Final assessed user-shell erasure loses subject authority or fails its FK | H-18, S-41 | For both executing and deferred requests, delete a due dependency-free deactivated shell with exact immutable authority; assert user absence and truthful completion, plus atomic rollback on injected failure |
| Verification audit events lack their actual case retention clock | H-22, H-33 | Exercise request/claim/reclaim/release/inspection/decision writers and provable legacy associations; verify exact case linkage and expiry 12 months after actual close, with unrelated subjects isolated and no fabricated receipt or fresh cleanup-time deadline |
| Case-first erasure strands verification snapshot/inspection data | H-22, H-33 | Exercise both lexical ID orders, one-task batches, retries and exact holds; verification data erases before its close anchor, and SQL independently blocks premature case deletion without orphaning the remaining deadline |
| Assessed request-first erasure loses surviving verification history's subject authority | H-18, H-22, H-33, S-41 | Erase the verification request before its case/audit/rounds; exact immutable case owner preserves claimed audit eligibility and later assessed task issuance across one-task batches, executing/deferred requests, holds and retries. Reject alternate-owner INSERTs/updates; backfill only provable owners, leave unknown legacy ownership unknown. Retained case FK blocks user-shell deletion; injected failure rolls back case deletion and its receipt |

Use focused D1 integration and migration checks under section 1.1; read-only
SQLite reproductions establish the reported defects, not repaired runtime or
hosted acceptance. Existing QAD §7.1 still requires actual synthetic D1/R2
erasure, recipient handover and backup disposition; do not infer those from CI.

### 1.4 Controlled dev acceptance observations, 2026-11-03

Observed PR28/PR29 release revisions/versions and intake state are in INDEX §6. The
operator's content-free receipts are `temporary/pr28-dev-postdeploy.json`,
`temporary/pr28-anonymous-probes.json` and
`temporary/pr28-controlled-dev-release-20261103.md`; these retain actual failures.
Post-repair receipts are `temporary/pr29-dev-postdeploy.json` and
`temporary/pr29-anonymous-probes.json`, observed 11:28 UTC. All 22 anonymous
checks pass after the normal deployment; this is distinct from the green
candidate's 1,314 Workers tests and 22 isolated browser scenarios.
This checkpoint is automated operator evidence, never owner manual acceptance.

| Cases / scope | Actual hosted result | Evidence or missing input |
|---------------|----------------------|---------------------------|
| PRD-F7/F8, INV-7; signed-out protected pages and current public notices | Pass for 18 established page probes | Protected pages redirect to sign-in; privacy/terms visibly 2026-11-02; no signed-in reacceptance exercised |
| PRD-F3, INV-4; anonymous nonexistent proof | Pass for 404/no-store/nosniff | No real proof identifiers used; unrelated/bare-admin and authorized proof reads unexecuted |
| PRD-F12, AB-24; anonymous export HTTP early denial | Initial fail preserved; post-PR29 pass for missing authorization, wrong scheme and query-token refusal | 404/no-store/nosniff on all three, no-referrer confirmed on scheme/query paths; actual delivery/one-use/artifact cleanup unexecuted |
| H-17/H-18/H-21/H-27/H-28, S-39–S-42; assessed export, closure/revocation, post-closure delivery and backup outcomes | Unexecuted | No dev admin or authenticated controlled subject; actual processor assessment, private delivery and recipient evidence needed |
| H-22/H-33, S-26–S-30; physical D1/R2 erasure, exact holds/release/retry and case history | Unexecuted | Cron and scheduled handler exist; no due synthetic fixture/task was executed, and no erasure is inferred from empty tables |
| H-04/H-12/H-29, NT-13; claims, proof inspection, ask-changes/reject/approve | Unexecuted | One moderator in dev inventory; additional independent controlled staff/account access required; no logs exist |
| H-13/H-14/H-30; independent private correction and filer update | Unexecuted | Authenticated parties/independent reviewer and synthetic publication prerequisite absent |
| H-06/H-11/H-15/H-16/H-20/H-31/H-32; records/ratings/fallback/counts/tags/Limited/empty | Unexecuted | Known controlled publication fixtures and five verified contributors still needed |
| PRD-F2/F3; disabled-intake mutation refusal, then bounded synthetic intake | Unexecuted authenticated mutation checks; actual configuration false | No intake window opened; minimum lifecycle/correction/erasure prerequisites remain undemonstrated |

Inventory is aggregate-only: three verified freelancers match the owner's LOG
§16 controlled-account report; one moderator, no admin, zero engagement logs and
zero maintenance tasks. All three verified profiles are active; one currently
satisfies the latest policy gates. Historical policy/engagement-consent receipt
versions remain present; no authenticated reacceptance is claimed. No existing
user was promoted, no session was fabricated,
and no raw purge or trigger override was used. Owner manual checkboxes in §7.1
stay unchecked. The full local Windows timing failure remains separate from the
green hosted candidate; no timeout was increased or failed evidence removed.

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
| H-17 | PRD-F12 | Data request resolved: User files an export request; responsible admin assesses and records the verified outcome | Request `completed` only after all assessed actions complete, actual subject receipt is evidenced and the one-use export artifact is erased; deletion/closure also requires verified physical backup disposition. Otherwise record truthful `deferred`/`denied` with reason and finite follow-up; token use alone is not receipt |
| H-18 | PRD-F12 | Account close assessed: User requests account closure | Assessed individually within 30 days; outcome recorded; surviving records follow the approved lifecycle |
| H-19 | PRD-F2 | File a log with covered period and optional amount: On an accepted engagement choose rating 4, tags On-time Payment, covered work start/end dates within the engagement, amount 50000 centavos, 60-character facts, one proof, submit | Log `pending` with period_start/period_end and amount_centavos stored; rating stored 4 with derived outcome Positive |
| H-20 | PRD-F14 | Older published contribution survives a newer rejected log: Pair has an older published log (rating 5); filer files a second log on a newer engagement that is rejected | Average still counts the older 5 with the contributor retained; the rejected log contributes nothing |
| H-21 | PRD-F12 | Account close deactivates without cascade: User with a published log inside its 12-month term requests closure; admin closes after assessment; issue real email codes before full closure/scrubbing | Account deactivated with access revoked and sessions gone; all four exact provider OTP identifiers erased before email scrub, old code cannot create a replacement account, unrelated prefix-like accounts/codes preserved; published log, proofs and consent history retain assessed deadlines; no USER cascade wipe |
| H-22 | PRD-F12 | Maintenance purges expired eligible rows: Expired publication without hold; exercise packaged scheduled handler and staff retry with a backlog larger than one batch | Both use identical guarded runner, maximum 25 claims/25 R2 deletes per run; progress bounded/durable, failures visible, physical erasure due next hourly sweep; exact R2 bytes confirmed absent before dependent D1 retirement |
| H-23 | PRD-F7 | Durable logout and replay rejection: Sign in, retain the original cookie, sign out successfully, then replay it; repeat logout and concurrent retries | Session row removed, cookie cleared, replay has no session; repeated/concurrent valid logout remains idempotent |
| H-24 | PRD-F1 | Pending request through live inspection: Freelancer captures account/profile name and portfolio, submits; moderator claims, records actual live inspection and approves with reason | Before inspection all five evidence fields NULL, exactly one open case and profile pending; inspection alone grants nothing; decision atomically verifies profile and closes both rows with matching decision/time and ids-only audit |
| H-25 | PRD-F4 | Release and expired-claim recovery: Claim verification, release, reclaim; expire lease, then let another moderator reclaim and reinspect | Each successful transition audited; leases last 30 minutes; different reviewer cannot decide from predecessor's inspection; original evidence never attributed to new reviewer |
| H-26 | PRD-F7 | Email-code sign-in survives passwordless hardening: Request and use an ordinary email sign-in code after denied password operations; inspect stored account fields | Sign-in succeeds; no password credential or hash is created; optional configured Google provider remains configured |
| H-27 | PRD-F12 | Close two verification/moderation/correction cases on different dates; keep account active; run maintenance immediately before and at each case's own 12-month deadline | Only each eligible case's minimal receipt/history expires at its own actual close plus 12 months; account activity, later cases and ask-changes round decisions do not restart that clock; required live references remain consistent |
| H-28 | PRD-F12 | Named processor verifies identity without ID collection, records export responsibility/assessment, prepares the permitted data and delivers to the authenticated subject; repeat post-closure through separately assessed export-only capability | Allowlisted data and per-file proof relationship checked against verified subject, never issuing admin; maximum 24-hour hashed one-use capability, no public URL, attachment/no-store/nosniff; no closed-account app/session revival; outcome recorded and R2 artifact purge confirmed after use/expiry |
| H-29 | PRD-F4, PRD-F2, PRD-F3 | Submit on time, claim/open proof, ask-changes, resubmit after anchor+15, then approve with a reason; repeat with reasoned rejection on a separate case | Human-approved proof/revision only; all review rounds and reasons preserved; actual terminal case close distinct from ask-changes; first submission/anchor unchanged; publication original date and expiry set once |
| H-30 | PRD-F13 | Request correction without hiding; independent moderator upholds; repeat with new evidence, ask-changes, then correct; separately withdraw and approve a filer's paid-late update | All four correction decisions supported; only approved current revision/rating visible, dated update metadata only; credible error/privacy assessment may hide temporarily; private request/counter-proof/history stays private and original expiry never moves |
| H-31 | PRD-F6 | Search two registered clients with identical names as a freelancer, open each, then open own record as each client | Separate identities and engagement counts; no contact/ID leak or name merge; client cannot search/read the other's record; eligible logs newest first with filer names and approved update dates |
| H-32 | PRD-F14, PRD-F6 | For one client seed freelancer A's older 5/newer 1, B's 4, C's 3, D's 2, E's 5 through approval; tie A's publication times on separate fixtures and order refs ascending | Average 3.0/count 5, no Limited record; first four contributors average 2.5/count 4 with Limited record; ties follow PRD ref ordering; outcome/tag/log totals use eligible logs, while average/count use one latest eligible contribution per pair |
| H-33 | PRD-F2, PRD-F3, PRD-F4, PRD-F12, PRD-F13 | Apply new forward-only migrations to disposable copies at 0008, 0009 and the current complete ledger; compare retained legacy snapshots/consent/decisions and run affected actions | Compatible ordered application, no old SQL/history rewrite, no invented legacy evidence or receipts; disabled intake's supported private read/query paths remain safe at 0008; full Worker deployment requires the current reviewed prerequisite schema even with intake false |

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
| S-28 | PRD-F12 | Erasure before expiry recalculates: Filer name or exact log/revision/proof has an earlier authorized assessed erasure deadline inside the publication term; delay maintenance with no issued task or only a planned task, and cross the deadline during R2 GET | Private detail/candidate/proof reads deny at the effective deadline before bytes; affected record and aggregates exclude unavailable content before the sweep; unrelated/shared retained evidence keeps its own clocks, holds extend storage only; never an anonymous publication |
| S-29 | PRD-F12 | Raw DELETE of unexpired content blocked: Direct SQL DELETE of an unexpired decided revision, tag, or proof row | Trigger rejects ordinary deletion; only the scoped maintenance path may erase due material or execute an authorized assessed early erasure, respecting documented holds |
| S-30 | PRD-F12 | Hold blocks an eligible purge: Expired row under an active review or legal hold presented to the maintenance run | Physical purge refused while the hold applies; the row stays hidden from reads and rating regardless |
| S-31 | PRD-F7 | Session revocation write fails: Real signed-in client signs out while D1 session DELETE aborts; restore writes and retry | HTTP 503 and generic SESSION_REVOCATION_FAILED, no false success/redirect/cookie clearing, existing session retryable; successful retry revokes copied-cookie access |
| S-32 | PRD-F1 | Missing identity inputs: Submit without real account/profile name or a portfolio link | Field errors, no request/case/audit/profile-pending change; no extra name approval is requested |
| S-33 | PRD-F1 | Invalid inspection tuple or approval: Direct D1 write with partial inspection, name_match 2/fraction/text, approval before inspection, fail result, or name mismatch | Database rejects each invalid state; no verified profile grant; legitimate complete failed inspection can close with reasoned rejection |
| S-34 | PRD-F4 | Stale lease, empty reason or wrong decision kind: Inspect/decide/release with stale claimant or expired lease; decide with whitespace reason, ask-changes or correction-only decision on verification | Conflict/validation failure and no mutation, no audit-only success; verification permits only approve/reject; a bare admin has no moderator bypass |
| S-35 | PRD-F1 | Mid-batch failure: Abort request or decision SQL with a D1 trigger after another statement would have written | Entire batch rolls back: no orphan request/case/event, no partial close and no profile grant; retry is possible |
| S-38 | PRD-F1 | Rejected request retains history: Reject before or after inspection, correct name/city/portfolio and submit again; reopen the old review | Old request/inspection/decision/reason and original submitted snapshot stay immutable; new request captures corrected inputs. Legacy originals stay unavailable; only an undecided legacy case may show separately labelled current inputs for fresh inspection. One undecided request; verified/suspended accounts cannot reopen this initial workflow |
| S-39 | PRD-F12 | Test 30-day boundary separately for idle draft, abandoned unpublished ask-changes, rejected initial log after final decision and abandoned proposed update; touch one before cutoff | No premature purge; close abandoned case first; rejected clock uses final decision, idle clock uses real activity; update cleanup removes only its unapproved revision and exclusively owned proofs, never shared active-publication evidence |
| S-40 | PRD-F12 | Keep a publication with active correction/legal hold across original expiry; release/expire hold and rerun maintenance; repeat while a correction is open at expiry | Immediately invisible/ineligible at expiry; bounded documented hold delays physical purge only; work cannot republish expired material; eligible deletion resumes after hold ends without resetting publication/history clocks |
| S-41 | PRD-F12 | Request closure at day 0; assess at the 30-day boundary; compare retained publication and earlier required name erasure; retry interrupted session revocation | Individual outcome/responsibility recorded within 30 days; deactivation denies old-cookie and new sign-in access; no retained-history cascade; lawful named retention only, otherwise hide/withdraw and recalculate before name erasure; failed work never recorded complete |
| S-42 | PRD-F12 | Retire a policy acceptance or close its purpose/account; run maintenance at its 12-month deadline; assess an erasure with encrypted backups still retained | Current gate acceptance survives only its active purpose; retired receipt deadline follows actual purpose end/closure; assessed backup deletion/expiry or bounded hold and restore re-erasure handling recorded, not a blanket indefinite exception |
| S-43 | PRD-F4, PRD-F3 | Queue at exactly 36 hours and just after; attempt decision at 30-minute lease expiry, blank reason, unsupported decision, missing or unapproved proof, unsupported event date | Overdue only after 36 hours; expired claimant cannot decide; correct case-kind decision required; no unapproved publication or partial round/case/revision/audit effect |
| S-44 | PRD-F13 | Propose update/correction to hidden, withdrawn or expired record; reject or abandon update; request again without new evidence | No visibility resurrection or clock reset; named client may request private review while retained record exists, subject to one-open/new-evidence rules; rejected/abandoned proposal never replaces active approved revision |
| S-45 | PRD-F14, PRD-F6 | Hide/withdraw/expire A's latest 1 in H-32, then remove the older 5; reject a newer log and leave an update pending | First falls back to 5 (average 3.8/count 5); then A leaves the denominator (average 3.5/count 4, Limited record); ineligible newer material never displaces eligible older contribution; empty record has no score |
| S-46 | PRD-F12 | Fetch export before/at/after its maximum 24-hour expiry, with wrong subject/missing token, after session-mode deactivation, with stale assessed identity/channel, and after interrupted claimed download; fail artifact deletion | Unauthorized/expired/replayed delivery denied without bytes; interrupted use needs new assessed delivery, never token replay; no automatic secret-link email; purge failure remains tracked/incomplete, not done; unknown backup handling remains deferred |
| S-47 | PRD-F2, PRD-F3 | Test rating 0/1/2/3/4/5/6/fraction, facts lengths 39/40/2000/2001, amount omitted/0/negative/fraction and proof count 0/1/5/6; valid signature files of 0/1/10485760/10485761 bytes plus mismatched size/type | Valid schema boundaries accepted, malformed signatures and out-of-bounds data rejected without partial storage; server verifies actual bytes; derived outcomes match PRD; image upload re-encoding removes synthetic EXIF/GPS, while visible private content and PDF screening remain human responsibilities |

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
| AB-22 | PRD-F12 | Probe a purge endpoint: Unauthenticated request guessing a maintenance or purge URL | 404: no public purge endpoint exists; scheduled execution and current-policy admin retry use the same exact guarded bounded runner; unauthorized actions cannot claim maintenance authority |
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
| AB-37 | PRD-F12 | Race maintenance with hold placement, edit/resubmit, closure and another cleanup; fail R2 delete or later D1 statement, crash claimed owner and retry | Conditional claim has one winner; no hold bypass, cross-subject deletion or premature success; surviving tracking permits bounded exact-object retry; never take over an unproven in-flight R2 owner on a timer |
| AB-38 | PRD-F12 | Another user/bare admin guesses export delivery; race two downloads of the one-use capability; expire/replay delivery; revoke subject access during preparation; supply another subject/hold/basis in an assessed purge request | Refused without private bytes or forged assessment; one atomic delivery winner; current authorized processor/subject/scope enforced atomically; no public maintenance authority, no data-bearing logs; cleanup respects finite delivery and assessed backup disposition |
| AB-39 | PRD-F4 | Race two log/update claims and approve versus ask-changes/reject/release; revoke reviewer role, ban, add conflict or expire lease immediately before write; inject late SQL failure | One fully authorized round/decision/publication transition; losers and failed batches leave zero revision/pointer/clock/case/audit effects; completed evidence immutable outside assessed maintenance |
| AB-40 | PRD-F13 | Race two corrections on one log and correction approval versus filer-update approval; substitute another log's revision or proof; use original/conflicted decider | One open correction and coherent current revision; no lost approved transition or cross-log/counter-proof binding; independent reviewer required at claim and decision; all losing writes roll back |
| AB-41 | PRD-F6 | Search SQL metacharacters/HTML and fetch records/data routes as client of another record, signed-out user, crawler, banned or stale-policy account; warm cache first with an authorized reader | Parameterized/escaped output, no injection or private response/cache leak; server query/action/page checks deny unauthorized requests even on warm caches; proof and correction internals absent from rendered/data payloads |
| AB-42 | PRD-F14 | Race publication, approved rating update, hide/withdraw and expiry while loading record; submit forged outcome/average/contributor count | Server derives eligible snapshot and rating outcomes; never mix in unapproved/stale/ineligible votes or accept client-supplied aggregates; only approved signals and PRD ordering present |
| AB-43 | PRD-F12 | Forge/expire/reuse maintenance grant, mismatch target or operation, broaden issued scope, lose staff authority before claim, use not-yet-due row or active hold; then attempt same mutations through SQL guards | Task issue/claim and exact operation-specific trigger guards reject without effects; no global maintenance bypass or destructive cascade; legitimate assessed due/early-erasure task succeeds only for its authorized scope |

### 4.1 Negative tests (invariants)

| ID | INV-# | Attempt to break the rule | Expected |
|----|-------|---------------------------|----------|
| NT-01 | INV-1 | Signed-in freelancer with no relation fetches a `pending` log through the record page and the query layer directly | Not present in the page; query returns nothing |
| NT-02 | INV-1 | Attempt publication through `submitLog`, filer update, correction request and unauthorized direct moderation calls, including correction restoration | No non-moderation path publishes. `decideLogReview` requires an authorized human review for initial/filer-update approval; `decideCorrection` requires independent authorized review for correction or restoration. Both recheck live claim, actor conflicts, current revision and exact proof receipts |
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
| NT-13 | INV-1 | Race approval against role loss/lease expiry and a filer update/correction; read before commit and after a forced batch failure, then at original expiry with a hold | No unapproved content in any page/query/aggregate; atomic human approval only; expired/held material never becomes visible |
| NT-14 | INV-2 | Submit with 0, 1, 5 and 6 proofs; race last-proof removal/failed upload and accepted-engagement revocation immediately before submit; bypass handler in isolated SQL | Only 1–5 fully attached valid proofs on an accepted engagement can submit; no partial pending/case/audit result on losing races |
| NT-15 | INV-3 | Run recognizable government-ID payloads at validator limits/encoded boundaries through new correction/update/reason/export processing; fail persistence and inspect D1/R2/captured events | No raw ID image/full number persisted or logged; legitimate numeric facts still work; content handling requires human evidence screening, never an implied perfect detector |
| NT-16 | INV-4 | Fetch old/new revision proofs and client counter-proof as unrelated user/bare admin/signed-out user; revoke role/relationship/access before authorization, hold through expiry and warm cache | Only actual moderators/filer/named client can access assessed retained proof; a hold/publication/export never creates public or unrelated access; denial leaks no bytes/URL |
| NT-17 | INV-5 | Exercise H-32/S-45 at contributor counts 0/1/4/5 and tied publications, race invalidation with record read, inspect schema/query/UI | Exactly approved ratings/average and required descriptive counts; correct eligible fallback and rounding; no fabricated score, ranking, endorsement or trust badge |
| NT-18 | INV-6 | Named client sends direct publication/tag/proof/pointer changes, forged correction decision and replay after an independent correction; race approved filer update | No client edit/delete is accepted; private request alone changes no publication; only authorized independent moderation can change visible approved content |
| NT-19 | INV-7 | Warm record/log/search/serialized responses under an authorized session, then repeat signed-out, after session revocation, and with crawler agents across expiry | No client record/log data in HTML, data response or shared cache; auth/crawler denial and noindex protection remain effective at boundaries |
| NT-20 | INV-8 | Render valid engagement/log/update forms; remove verification, suspend/close account or change current acknowledgment before save/submit; race accepted writes at policy-version change | Live server gates deny all stale/unverified/unacknowledged filing and engagement creation with zero partial profile/log/proof/case effects; valid already-accepted upload compensation still completes safely |

## 5. Coverage matrix

Every Must-Have has at least one case in each class. PRD-F5 and PRD-F10 are Retired and excluded from required coverage; their old case IDs stay reserved and are never reused.

| PRD-F# | Happy | Sad | Abuse |
|--------|-------|-----|-------|
| PRD-F1 | H-01, H-24 | S-01, S-02, S-32, S-33, S-35, S-38 | AB-01, AB-02, AB-23, AB-26 |
| PRD-F2 | H-02, H-19, H-29, H-33 | S-03, S-04, S-16, S-17, S-18, S-19, S-25, S-47 | AB-03, AB-04, AB-21 |
| PRD-F3 | H-03, H-33 | S-05, S-06, S-43, S-47 | AB-05, AB-06, AB-17, AB-20 |
| PRD-F4 | H-04, H-12, H-25, H-29, H-33 | S-07, S-08, S-34, S-43 | AB-07, AB-08, AB-27, AB-28, AB-31, AB-39 |
| PRD-F5 | Retired (H-05, S-09, AB-09 reserved) | — | — |
| PRD-F6 | H-06, H-11, H-31, H-32 | S-10, S-23, S-24, S-45 | AB-10, AB-11, AB-41 |
| PRD-F7 | H-07, H-23, H-26 | S-11, S-31 | AB-12, AB-25, AB-32, AB-34, AB-36 |
| PRD-F8 | H-08 | S-12 | AB-13, AB-34 |
| PRD-F9 | H-09 | S-13, S-14 | AB-14, AB-15, AB-33, AB-34, AB-35 |
| PRD-F10 | Retired (H-10, S-15, AB-16 reserved) | — | — |
| PRD-F12 | H-17, H-18, H-21, H-22, H-27, H-28, H-33 | S-24, S-26, S-27, S-28, S-29, S-30, S-39, S-40, S-41, S-42, S-46 | AB-22, AB-24, AB-37, AB-38, AB-43 |
| PRD-F13 | H-13, H-14, H-30, H-33 | S-20, S-21, S-22, S-44 | AB-18, AB-19, AB-40 |
| PRD-F14 | H-15, H-16, H-20, H-32 | S-03, S-45 | AB-18, AB-42 |

### 5.1 Invariant coverage

| INV-# | Negative tests |
|-------|----------------|
| INV-1 | NT-01, NT-02, NT-11, NT-13 |
| INV-2 | NT-03, NT-04, NT-14 |
| INV-3 | NT-05, NT-15 |
| INV-4 | NT-06, NT-16 |
| INV-5 | NT-07, NT-12, NT-17 |
| INV-6 | NT-08, NT-18 |
| INV-7 | NT-09, NT-19 |
| INV-8 | NT-10, NT-20 |


### 5.2 Metric verification

PRD section 5 defines all FLAG-M metrics, including retired IDs. Use the matching
feature acceptance cases and actual case timestamps, current policies, eligible
published ratings, hold register and confirmed deletion outcomes. Pilot account
counts and QA survey establish participation/satisfaction. Do not claim real
operational measurements from synthetic fixtures or count a hidden row as erased.

## 6. Not tested

| Area | Boundary |
|------|----------|
| Optional workflows | Notifications, QR automation and unapproved candidates remain deferred; no acceptance is claimed |
| Live mail / configured Google | Synthetic tests do not establish provider/inbox/OAuth behavior |
| Human acceptance and physical devices | Desktop/mobile Chromium is automated evidence only |
| Deployed bindings and migrations | Local builds and fixtures are not a remote inspection |
| Deployed privacy operation | Isolated D1/R2 tests establish the exercised boundaries; actual dev scheduler, assessed copy disposition and owner acceptance require their own evidence |

Existing and pilot negative suites exercise their implemented boundaries;
local results do not establish hosted or human acceptance.
No Active invariant is waived.

## 7. Release gate

Green CI plus owner manual smoke of the intended shipped slice. Minimum safe
lifecycle/correction capabilities precede real proofs/publication. No new
billing, release-identity, recovery-drill, device/Messenger or approval gates are
introduced by this document.

### 7.1 Owner manual acceptance

The owner's 2026-11-02 existing-dev report covers signup/verification/moderation
only. After implementation and prerequisites, use separate synthetic accounts
on dev for this new slice. Record date/environment/tested revision, case IDs and
actual pass/fail/blocked results; record issues rather than assumed passes.

- [ ] Current-policy freelancer creates an accepted engagement; file a complete
  rated log with synthetic proof; unrelated account and signed-out visitor cannot
  see private content or fetch proof. Disabled-intake rejection was checked first.
- [ ] Moderator claims, inspects proof, asks changes, then approves after the
  filer resubmits; reason/history retained, only approved facts appear in record.
  Separately reject unsupported evidence; check another reviewer cannot steal
  a live lease or decide with expired authority.
- [ ] Search two same-name clients as a freelancer; read the right record and
  named filer's approved update. Client reads own record only. Check calculated
  average/count, Limited record and empty state against known fixture ratings.
- [ ] Client requests private correction with synthetic counter-proof; original
  decider is refused, independent moderator upholds/corrects/withdraws as planned.
  Filer submits approved paid-late update. Requests/notes stay private and no
  request, update or hold extends the original publication deadline.
- [ ] Named processor records assessed export and closure, delivers only scoped
  private data and revokes closed-account access; check retained evidence and
  assessed name erasure behavior. Exercise expired synthetic D1/R2 cleanup,
  hold/release and per-case minimal-history deadlines using prepared fixtures.

Automated boundary/race tests accompany this concise smoke. Main promotion
still needs the owner's later approval; dev synthetics do not authorize real
pilot proof collection or imply production acceptance.
