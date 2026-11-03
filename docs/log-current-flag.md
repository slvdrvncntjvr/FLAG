---
spine_type: LOG
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.24
status: Draft
owner: slvdrvncntjvr
created: 2026-10-31
updated: 2026-11-03
reconciled: 2026-09-14
---

# Current decisions: FLAG

Current product decisions live in IDEA and PRD, implemented contracts in SDD,
and current delivery state in INDEX. This log records changes to that baseline.
The owner removed the superseded `docs/log-flag.md` and pre-consolidation
`archive/docs-2026-10-31/` on 2026-10-31. Earlier verification entries below
describe evidence available at the time, not currently retained files. Committed
history remains in git; no external backup or recovery of uncommitted historical
additions has been verified. Read history only for a specific decision or incident.

## 1. Decisions

| Date | Decision | Rationale | Docs touched |
|------|----------|-----------|--------------|
| 2026-11-03 | Owner supplies authenticated Orca dev access and grants broad authority for work contributing to production | Continue necessary synthetic roles/fixtures, supported acceptance, repairs and protected release preparation without repeated permission requests. Actual human decisions and manual acceptance must still be observed; immediate phase remains dev acceptance with real intake disabled and main/production unchanged | INDEX, QAD, current LOG |
| 2026-11-03 | Owner authorizes confirmed retention and documentation/release repairs on slvdrvncntjvr/fix-pilot-retention-20261103, based on dev e2bab1d, while governing docs remain Review | Repair all three confirmed retention defects and scoped operator/build/QA guidance; verify and prepare the repair PR and corrected PR20 description, keeping PR20 draft. Production and intake stay unchanged; no remote migration/deploy, optional/paid scope, invariant change, reconciliation advance or history restore. Coordinator reviews and publishes metadata; this worker prepares local documentation only | SDD, BUILD, QAD, OPS, INDEX, current LOG |
| 2026-11-02 | Owner authorizes the remaining approved pilot on feat/pilot-readiness-20261102 while governing docs remain Review | Complete PRD-F12/PRD-F13 lifecycle/corrections, PRD-F4 log moderation/publication and PRD-F6/PRD-F14 records/ratings on dev before main; necessary docs/schema/implementation approved. Keep development intake disabled; backed-up dev migrations/deploy and synthetic acceptance intake only after prerequisites. Later main merge needs owner approval; no paid upgrades or optional scope; preserve SPINE 0.3.0, invariant meanings, SQL/history and deleted-LOG finding | SDD, QAD, OPS, INDEX, current LOG |
| 2026-11-01 | Owner authorizes implementing the prior review recommendations, verifying the candidate and merging dev-2 into dev while docs remain Review | Restore PRD-F9 city wording and require city for new client profiles only; existing profiles including legacy NULL city remain reusable, freelancer verification city remains optional, no migration/backfill. Repair composed government-ID URL labels with bounded decoding, separate query pairs and first/corrected-submission zero-write regressions. Preserve SPINE 0.3.0, invariants, owner work and historical rows; retain the known checkpoint deletion finding. Final checks, review and merge outcomes remain pending in INDEX; no deployment or human acceptance is implied | PRD, SDD, QAD, BUILD, INDEX, current LOG |
| 2026-11-01 | Hold dev-2 integration after independent run run_7438fbbffbd0 finds a residual R1 verification-URL privacy blocker | Three reviews completed: tooling has no substantive finding, documentation flags qualified city-optionality drift, application finds a composed-label bypass. Earlier passing checks remain dated evidence; main is assessment only and no hosted/human/full-product certification follows | INDEX, current LOG |
| 2026-11-01 | Scoped audit repair disables persisted Workers logs and traces in both source environments while retaining fixed application event emission | Invocation suppression alone does not establish that custom-log metadata omits capability URLs. Avoid default platform retention at the cost of stored console diagnostics; no configured exports, Tail consumer or Logpush. Actual hosted overrides/history remain uninspected and unchanged; OPS records the operator-channel and historical-retention limits | OPS, SDD, QAD, INDEX, current LOG |
| 2026-10-31 | Owner authorizes execution of the audit implementation plan with supervised Orca workers while the governing docs remain Review | Repair R1–R10, compatible dependency advisories and Windows lifecycle verification locally; preserve existing work, SPINE 0.3.0 and invariant meanings. Deny unused OTP checks, bind consent to displayed profile state, authorize explicit removal atomically, count removal as activity, and align inspection wording with existing reviewer semantics. No deployment, remote migration, intake enablement, commits, checkpoints or history restoration | SDD, QAD, BUILD, OPS, INDEX, current LOG |
| 2026-10-31 | Owner intentionally removed the archive and original LOG, explaining that the current LOG was its replacement | Keep current context concise; record that replacement of startup context does not preserve historical evidence. Do not restore automatically. No external backup is verified | INDEX, current LOG, AGENTS.md |
| 2026-10-31 | Owner authorizes a full documentation overhaul and web assessment on new branch dev-2, accepting the recommendation to reduce routine context | Preserve approved product meaning and all eight invariants; make current status, requirements, source contracts, commands and remaining work easy to find. This authorizes this consolidation and factual web-copy repairs. It does not authorize deployment, remote migration, paid services, or automatic implementation of the remaining product | INDEX, BUILD, PRD, SDD, QAD, OPS, LOG, AGENTS.md, web/README.md |
| 2026-10-31 | Keep historical proposals and receipts outside routine reading; retain the old log as Superseded for append-only checkpoint compatibility | Exact original working-tree docs are archived with hashes. No previous owner decision is retrospectively invented. Current decisions are stated directly in their owning document; old release gates and superseded Open rows are historical | INDEX, LOG, AGENTS.md |
| 2026-10-31 | Resolve Q27 under the owner's delegated engineering judgment: retain existing optional Messenger external-browser help | It is support copy for file selection, adds no reputation or client feature, and creates no Messenger/device acceptance requirement. No new helper implementation is needed | PRD, BUILD, LOG |

## 2. Open questions

As of 2026-11-03, no city or R1 product decision remains open: the owner approved
the city requirement and the bounded repair was integrated (section 11; INDEX).
The earlier findings remain dated evidence in section 9. The design milestone
and pilot integration are recorded in sections 14 and 19.

Present operational questions are who will perform/sign off the outstanding
hosted authenticated pilot and actual synthetic D1/R2 erasure/recipient/backup
acceptance, and when; later production promotion remains the owner's choice
after that evidence. Actual privacy/hold/backup assessments remain staff inputs.
The owner already confirmed that the three verified dev freelancer accounts are
controlled test accounts (section 16); maintain containment if eligibility
changes before any authorized synthetic window. Intake remains false.
See [INDEX remaining work](index.md#7-remaining-work) and section 20 for the
current repair state; these are not requests to reconfirm settled scope.

## 3. Resolved questions

| ID | Resolved | Question | Answer |
|----|----------|----------|--------|
| Q27 | 2026-10-31 | Disposition of the existing Messenger browser helper | Keep as optional support copy; see the decision above |
| Q28 | 2026-10-30 | Can email reception replace lifecycle/correction capabilities? | Email may receive requests handled and recorded by the named owner. Minimum safe lifecycle and correction capabilities must precede real proof collection or publication; a polished self-service interface may follow later |

## 4. Dead ends

None in this consolidation. Historical attempts remain in the superseded log.

## 5. Recoveries

| Date | Checkpoint | What went wrong | Resolution | Docs restored |
|------|------------|-----------------|------------|---------------|
| 2026-10-31 | spine-cp-2026-10-26-1 | Post-deletion audit found four broken links and the missing original LOG; the current LOG was mistaken for a replacement for all historical evidence | Owner confirmed intentional deletion. Removed broken links and recorded the evidence gap; checkpoint deletion finding remains expected and visible. No checkpoint/history rewrite | None |
| 2026-10-31 | spine-cp-2026-10-26-1 | Independent Orca review found two approved details lost in consolidation: engagement counts in client-name search results and the explicit false-log removal/suspension onboarding confirmation | Restored both details in PRD 2.2 from the archived PRD; the three confirmations remain enforced in source. No scope or invariant change | None; targeted corrections only |
| 2026-10-31 | spine-cp-2026-10-26-1 | Current context mixed status, old proposals, detailed receipts and future design; prior recorded scope drift made the distinction harder to recover | Owner-authorized consolidation on dev-2. INDEX owns current status; archived history is excluded from normal startup. Preserve source facts, approved requirements and unchanged invariants | None; originals archived, no restore or git history rewrite |

## 6. Consolidation verification, 2026-10-31

Observed on the uncommitted `dev-2` working tree based on `f222efa`:

- SPINE validation: zero errors, two warnings confined to the historical LOG
  and deferred QR RFC; checkpoint verification clean; git diff --check clean.
- Typecheck, lint, 699 Workers tests, 27 Node deployment/redirect/harness tests,
  five local-setup tests and three Python runner tests pass.
- Dev Worker build passes. Packaged local workerd smoke passes ten route checks
  and OTP statuses 400/400/400/400/400/429 after a filesystem-access retry.
- All 18 desktop/mobile browser scenarios pass. That full sandboxed invocation
  exits 1 at Windows process-close verification and retains its temporary data.
  A focused mobile anonymous-route retry with expanded process/filesystem access
  passes with exit 0 and clean teardown; this is not a second full-suite run.
- Landing page reviewed at 360px and 1280px, HTTP 200 and no horizontal overflow.
  SDD matches all 18 source tables and 159 columns. Requirement/metric/test IDs,
  all eight exact invariant rows, and all 284 historical LOG table rows survive.
  All 13 archived files match their hashes. Pre-existing privacy source/tests
  retain their original hashes. Default root searches skip historical docs.

Current reference text is approximately 70 percent smaller. No remote deployment,
new independent review or owner acceptance is claimed.

## 7. Independent review, 2026-10-31

Orca run `run_432a43ff4d0a` independently reviewed the consolidation against
the archive and source. Two omitted PRD details were restored as recorded in
§5. The review confirmed the eight invariant rows, twelve metric rows and
18-table/159-column ERD; remote state and every historical receipt were outside
its coverage.

Fresh typecheck, lint, 181 targeted privacy/intake tests, 27 deployment/harness
tests and three Python runner tests pass. All 18 browser scenarios pass again,
but the full command exits 1 at Windows process-close verification and retains
its isolated temporary data. Expanded read-only inspection afterward found no
matching test server process or listener on port 3000. The runner's teardown
verification remains unresolved; no fully clean full-suite run is claimed.

## 8. Audit repair verification, 2026-11-01

Owner-authorized Orca run `run_edee001ef9ef` completed the ten scoped audit
repairs and compatible dependency updates on local `dev-2`. SDD, QAD, BUILD
and OPS own the changed contracts, regressions, commands and logging limits.
Independent source review identified a migration-test LF/CRLF defect; a separate
repair was independently verified. No substantive source findings remain.

Fresh combined typecheck, lint, 885 Workers tests, 61 Node tooling tests, five
setup tests and three Python runner tests pass. Both dev and production Worker
builds and no-upload packages pass; each packaged smoke exits 0 with verified
teardown, free port and removed owned data. Production audit reports zero
advisories; the full graph retains 15 moderate development-package entries under
one minimatch advisory, with no high/critical findings.

The initial full browser run failed in the new consent test. A focused run
exposed a second test assumption after fixing its label selector: React resets
uncontrolled fields after a resolved form action. Both test-only corrections
were independently reviewed, preserving the exact stale-profile race and fresh
consent assertions. The corrected focused run passes both viewports. The final
full Windows browser command passes all 18 scenarios, exits 0, verifies teardown
and port release, and removes its owned data. Failed attempts retain their data.
The historical full-browser teardown cause remains unestablished; current
acceptance does not retrospectively attribute it to the confirmed smoke race.

Original SQL/older snapshot bytes, all eight invariant rows and pre-existing
owner work are preserved. New untracked archive copies were observed and left
untouched; continuity with deleted historical material is unverified. Normal
SPINE validation passes with the deferred-RFC warning; strict validation still
fails on its two existing TBD markers, and checkpoint verification retains the
intentional old-LOG deletion finding. No reconciliation date or history changed.
All supervised tasks settled and reclaimable worker enumeration is empty;
user-owned/identity-unproven retained resources remain untouched. Real intake
stays disabled. No deployment, remote/developer-store migration, commit or new
checkpoint was performed.

## 9. Independent readiness review, 2026-11-01

Run `run_7438fbbffbd0` completed three independent reviews: tooling found no
substantive issue, documentation found qualified city-optionality drift, and
application review found a residual R1 privacy blocker. Merge is held; the
earlier section 8 clean-review conclusion is historical evidence, superseded by
this finding. Main remains assessment only.

**Residual R1.** Composed labels `sss_account_number` in query/fragment,
`tin_identification_number` in query, and
`social_security_system_account_number` in path pass both the privacy validator
and actual verification schema with formatted synthetic 9/10-digit numbers.
The label patterns at `web/src/features/verification/privacy.ts:20` and `:32`
miss these compositions; `web/src/features/verification/schema.ts:4` accepts
them, allowing `web/src/features/verification/submit.ts:26`–27 to persist both
portfolio URL and submitted-profile snapshot. Coordinator independently
reproduced all four forms; simple `sss_number` rejects and ordinary numeric
project URLs remain valid. Broaden composed government-label recognition and
add first/corrected-submission zero-write and encoded query/path/fragment
regressions, retaining ordinary project URLs. No repair is claimed.

**Qualified requirement drift.** Current PRD-F9 explicitly calls city optional
(`docs/prd-flag.md:145`–146); the prior PRD at `f222efa:docs/prd-flag.md:110`
lists city and calls only registration optional. Source optionality already
existed at `f222efa:web/src/features/engagements/schema.ts`; targeted Q18 history
establishes account-based matching, not explicit approval of city optionality.
Intent remains unresolved; this review does not change PRD or derive approval
from source. All eight IDEA/PRD invariant rows match `f222efa`, and SDD matches
18 source tables and 159 column names.

Fresh coordinator read-only Cloudflare settings checks found
`invocation_logs=true` and `logs.persist=true` on both `flag-dev` and `flag`, with
no Tail consumers or Logpush. Source protection is undeployed; retained log
content was neither inspected nor changed. Dev bindings are correct and intake
is false; production lacks PROOFS.

Fresh coordinator checks pass typecheck, lint, 61 tooling tests, five setup tests,
three runner tests, dev build and no-upload dev packaging. Initial full Workers
run: 884/885, one five-second auth-passwordless timeout under load; standalone
focused retry: 21/21. No fully green full rerun is claimed. Tooling/setup pass
with elevated process permissions after sandbox taskkill failures. Packaged dev
smoke passes ten route checks and OTP statuses 400/400/400/400/400/429, sends no
mail, exits 0 and verifies teardown, removed owned data and free port. Production
audit reports zero advisories; full graph retains 15 moderate development-package
entries and no high/critical findings. These checks do not prove dependency
non-exploitability or full-product, hosted CI or human certification. R10 permits
same-reviewer personal inspection reuse with a current lease; only a different
reviewer must reinspect (`docs/sdd-flag.md:376`–380).

Coordinator excluded `/archive/` from Git staging via `.gitignore`; existing
`.rgignore` exclusion already keeps it outside routine searches. All 16 local
archive files remain; 13 snapshot files match their manifest hashes, which does
not establish continuity with owner-deleted history or an external backup.
The recorded original-LOG checkpoint deletion finding remains; no history,
checkpoint, reconciliation date, deployment or migration changed in this review.

## 10. Review follow-up scope, 2026-11-01

PRD-F9 restores city with only DTI/SEC registration optional. SDD and QAD now
state the new-profile/legacy-profile boundary and the composed-label URL
contract and regression expectations. BUILD distinguishes the known old-LOG
checkpoint deletion from unexpected drift. Final delivery outcomes belong in
INDEX after coordinator checks and review; no new test pass or merge is recorded
by this documentation patch.

The initial snapshot-preservation claims in cr-004 and the earlier LOG rows
describe consolidation before the owner's later deletion. They remain historical
claims, not evidence that the deleted uncommitted history or an external backup
is now recoverable; section 5 records that evidence gap. No history restoration,
suppression or new checkpoint is authorized by this follow-up.

## 11. Implemented review follow-up, 2026-11-01

Owner-authorized run `run_b63004bf5c6f` repaired the composed-label URL bypass
and restored required city on new client profiles without changing legacy data.
Independent city review found no substantive issue. URL review found a further
Unicode-hostname bypass caused by punycode conversion; the follow-up inspects
the original hostname with URL authority/control-whitespace boundaries and no
Node-only imports. Independent recheck passed 196 actual-schema probes with
no substantive finding. Recognition remains bounded, not a universal classifier.

The final source run passes all 1,047 Workers tests in 35 files. Typecheck,
lint, 61 tooling tests, five setup tests and three runner tests pass. Fresh audit
reports zero production advisories and 15 moderate development-package entries,
with no high/critical findings. The final packaged/browser and hosted CI gates
still precede integration; INDEX owns their current outcome. No remote migration,
intake enablement, production promotion or human acceptance is claimed here.

## 12. Dev integration and hosted verification, 2026-11-01

[PR24](https://github.com/slvdrvncntjvr/FLAG/pull/24) merged as `cde6943` after
the owner's go-ahead and green required checks in
[run 41314347205](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41314347205).
The first full browser attempt exposed a missed private-intake setup fixture:
native validation blocked its new profile because city was absent. Commit
`e20d450` supplies city without weakening assertions. The final full Windows
browser command passes 18/18, exits 0, verifies teardown/free port and removes
owned data; the failed attempt retains its evidence. INDEX owns the final matrix.

The normal dev Workers Build deployed the baseline. Read-only settings checks
confirm the expected bindings, disabled intake, invocation logging and platform
log/trace persistence off, tracing off and no Tail consumers/Logpush. Nine
read-only page checks and anonymous proof denial pass. The HTTP session endpoint
was deliberately not probed because its limiter writes counters. Dev's migration
ledger remains 0000-0008; no remote migration or retained-log inspection/deletion
occurred. Production remains unchanged and unpromoted; its readiness work is in
INDEX and OPS, not implied by green local tests. No new human acceptance,
reconciliation date, checkpoint or history restoration is claimed.

## 13. Required-city notice alignment, 2026-11-01

A final copy check found that the earlier city review missed the privacy notice
and terms: both still called client city optional after PR24 required it for new
profiles. The factual correction states the new-profile requirement and existing
profile reuse, including legacy NULL city; freelancer verification city stays
optional. Privacy/terms versions become `2026-11-01`, requiring reacceptance under
the existing PRD-F8 gate when deployed. Freelancer acknowledgment and per-engagement
consent versions remain unchanged, and historical acceptance/receipt rows are not
rewritten. [PR25](https://github.com/slvdrvncntjvr/FLAG/pull/25) includes this
source follow-up and the integration-status docs; its checks own delivery evidence.

## 14. Approved pilot design and evidence correction, 2026-11-02

The owner explicitly approved the remaining required pilot work while the docs
remain Review, including necessary design/schema changes and implementation on
`feat/pilot-readiness-20261102`. Delivery scope is the lifecycle/correction
prerequisite, log moderation/publication and client records/ratings defined in
PRD-F4, PRD-F6, PRD-F12, PRD-F13 and PRD-F14. Development intake stays disabled.
Backed-up dev migrations/deployment and synthetic acceptance intake are authorized
only after the prerequisite checks; a later main merge needs a new owner
go-ahead. No paid upgrades, optional notifications/QR or expanded product intent.
Human reconciled dates stay unchanged.

The owner reports current dev signup, verification and moderation working,
without specifying other scenarios. Record only that limited report; it does
not establish acceptance of publication, correction, erasure/export, records,
rating fallbacks or production. INDEX owns delivery state and remaining work.

Prior coordinator audit `run_f8e7c3f97f0b` on **2026-11-01**, relayed in this
dispatch, observed PR25 head `cc98d2846e692fa56f8c3e17d5f3511c349accf4`
merged as `4f216e9229340d64c51051286c30afb38d6434c5`, successful required and
merge checks, Workers Builds and dev version at 100%, current notice versions,
intake false, persisted dev logs/traces off and expected bindings. INDEX corrects
the PR24-only deployed label and cites the dated checks. No fresh GitHub,
Cloudflare, hosted page or user-data inspection occurred in this design task;
production remains the prior recorded baseline. Local git independently
identifies the PR25 merge, not hosted delivery.

SDD 2.29 extends the one ERD/register/constraints before migration: responsible
privacy requests/outcomes, private exports, actual case-close anchors and
immutable review rounds/proof verdicts, independent correction evidence and
filer revisions, bounded holds, exact assessed-maintenance grants and backup
disposition. It defines an hourly bounded maintenance executor, preserves
ordinary freeze guards and original publication/expiry, and specifies one shared
eligible rating/record projection. Nine new target tables are explicitly planned;
no schema, app code, migration, published SQL or historical receipt was edited
by the design worker. Implementation ownership/interfaces are supporting context
in ignored `temporary/pilot-design-20261102.md`; SDD is the durable contract.

Normal SPINE validation passes at the design checkpoint: zero errors; warnings
are the deferred QR RFC and nine intentionally unimplemented target entities.
Checkpoint verification still reports the owner-deleted original LOG against
`spine-cp-2026-10-26-1`, already classified in §5; no suppression, history restore
or replacement checkpoint. Design review and implementation verification remain
subsequent work, not consequences of passing document validation.


## 15. Pilot implementation checkpoint, 2026-11-02

The independent design review identified two retention-contract gaps: a required
live correction-to-log reference blocked original content expiry, and umbrella
user/case holds lacked precise category coverage. SDD repairs define nullable
live references with immutable content-free subject references, exact-object
holds, ordered detachment, actual case-close anchors and finite assessed work.
Implementation continues under the owner's existing scope; no invariant, human
reconciliation date, historical SQL 0000-0009 or checkpoint was changed.

The feature branch now contains schema/migrations, human proof-review rounds,
private corrections/updates, client records and ratings, assessed privacy tools,
short-lived metadata exports and a scheduled maintenance entry point. Focused
D1 runs establish initial publication/correction paths and closed-account denial.
An integration run exposed an onboarding insert-select missing the new retired
receipt field; the projection was repaired and the six closure/authentication
tests pass. Further review found retention-selector and deferred retry/recovery
gaps, which remain release blockers until repaired and independently verified.
Routine command output stays in task reports; INDEX owns delivery status.

Three supervised workers ended their turns at an explicit account usage limit.
The coordinator inspected their transcripts, preserved all partial changes,
stopped those attempts and resumed the same Tasks using Orca retry provenance
and the currently configured agent. No credit purchase or paid upgrade occurred.
The implementation is not declared complete from their earlier partial passes.

Candidate privacy/terms copy now describes the pilot workflows and prepares
version 2026-11-02; the schema owner must align database current-policy authority
and fixtures before final verification. Existing engagement-consent and
freelancer-acknowledgment versions/history remain unchanged. No dev backup,
remote migration, deployment, intake enablement or main merge has occurred at
this checkpoint. The original LOG deletion finding remains visible.


## 16. Independent pilot implementation reviews, 2026-11-02

Two bounded independent source reviews covered schema/lifecycle/backup and the
application's moderation, corrections, records, ratings, authentication and
private routes. They found seven concrete issues: proof-compensation hold races,
late export and proof writers outliving cleanup tracking, delayed retry after
settled proof deletion failure, omitted natural and cross-request assessed
export deadlines, and private proof reads beyond unpublished retention clocks.
The implementation owners are repairing these within the existing scope.
Subsequent writer re-review also identified a guarded claim that could prevent
already claimed unrelated maintenance from completing; this is under repair.
Static review completion does not establish tested repairs or release acceptance.

SDD 2.38 defines explicit export/proof writer fences before schema changes:
immutable unique keys remain tracked while writes are unresolved, settlement
follows awaited storage I/O, and time alone cannot transfer ownership. Ordinary
self-removal retains its tracking tombstone while a late writer remains possible;
assessed physical erasure must not complete or delete tracking prematurely.
Shared retention and assessed-source deadlines govern reads and export lifetime.
Old published SQL 0000-0009 and invariant meanings remain unchanged.

The owner confirmed that all three verified dev freelancer accounts are
controlled test accounts. This resolves the synthetic acceptance containment
question for the global intake switch; it does not enable intake or authorize
real pilot data. At this checkpoint no dev backup, remote migration, deployment,
intake enablement, main merge, or history restoration has occurred.

## 17. Dev merge repair and integration authorization, 2026-11-02

After the merge-readiness assessment, the owner explicitly authorized repairing
the remaining defects, verifying the candidate and merging it into dev. This
covers the necessary commit/PR/CI and the existing OPS migration-before-deploy
sequence; it does not promote main, approve real intake, change invariant
meanings, advance human reconciliation or authorize paid/optional scope.

The bounded assessment found subject OTP identifiers missed by closure and
assessed ownership mapping, earlier assessed erasure deadlines missed by private
reads/records before maintenance, and missing nosniff on anonymous proof denial.
SDD 2.39 makes exact provider credential ownership and physical expires_at cleanup
explicit. Separate Orca workers own these repairs; passing final integration,
actual dev backup/migration, merge and deployment remain evidence to establish,
not consequences of this authorization. INDEX owns their eventual delivery state.

## 18. Pilot candidate verification and backup repair, 2026-11-02

The independent repair rereview cleared exact OTP lifecycle ownership, effective
assessed read deadlines and private denial headers in the inspected stable
source. Whole-candidate Workers and both full browser environments pass; INDEX
owns the counts and dated candidate CI link. The Windows suite used its explicit
bounded local allowance, while hosted Linux passed the unchanged default.
The earlier stale-copy/timeout and Linux packaged-startup failures remain failed
evidence, superseded by their complete successful runs rather than suppressed.

The real dev backup attempts exposed two defects in its helper: Windows
PowerShell can terminate on redirected native stderr despite a successful exit,
and installed Wrangler export accepts skip-confirmation rather than yes. Direct
installed Node invocation with drained private streams and exact exit handling,
the supported flag, synthetic argument/stream/failure tests and local CLI parsing
repair those defects. The 14:30 UTC dev export produced a new encrypted artifact
in the established owner backup directory, verified by in-memory DPAPI decrypt,
byte length and SHA-256; plaintext cleanup passed. No artifact from either failed
attempt is described as verified. The coordinator has not yet applied dev
migrations or merged at this checkpoint; main and real intake remain excluded.

## 19. Pilot dev integration, 2026-11-02

After final required candidate checks passed, the coordinator took and verified
a fresh encrypted dev D1 backup at 14:52 UTC, then applied exactly the reviewed
pending migrations 0009, 0010 and 0011. All succeeded; read-only ledger,
foreign-key and current-policy checks passed. PR26 merged into dev as f46be4c
at 14:53 UTC. The automatic dev deployment is observed at 100% with fetch and
scheduled handlers; INDEX owns its exact version and delivery/acceptance limits.

Read-only actual settings retain the approved DB/PROOFS/auth-origin bindings,
disabled intake, disabled invocation/persisted logs/traces, no Tail/Logpush and
the hourly cron. This does not execute a live erasure task, prove recipient
handover/backup disposition, or establish authenticated hosted/manual acceptance.
Main, production configuration, real intake, invariant meanings, reconciliation
dates and historical deletion evidence remain unchanged.

## 20. Confirmed retention and release repairs authorized, 2026-11-03

The 2026-11-02 independent application and documentation/release reviews examined
dev e2bab1d. The owner authorizes their confirmed repairs on the isolated repair
branch; the original dev baseline and its deployment are unchanged at this
checkpoint. This entry records authorization and pending work, not repaired,
tested, merged or deployed behavior.

Three PRD-F12 defects are confirmed: final assessed user-shell purge either
fails its subject FK or loses the nullable subject used for authority;
verification audit writers omit the actual case association/deadline, leaving
events without natural expiry and exact subject mapping; case-first erasure
removes the verification request's only close anchor, stranding its snapshot/
inspection data. Repair exact atomic authority, provable case associations and
dependency ordering/guards, preserving finite actual-close clocks and holds.
Focused acceptance mapping is in QAD §1.3; code/migration and runtime evidence
remain the application worker/coordinator's work to establish.

The documentation work corrects current OPS controls, BUILD's query-only 0008
qualification, QAD outcomes/moderation transitions and startup orientation.
Proposed replacement PR20 metadata describes the actual integrated pilot,
pending production ledger inspection/verified backup/migrations before deploy,
existing GitHub protections and current acceptance limits; the coordinator must
review it before publication. PR20 stays draft and needs the final repair PR
link after it exists. INDEX owns current delivery state; no new migration is
claimed applied, and 0012 is not recorded deployed. Hosted authenticated pilot
and actual physical-erasure/recipient/backup acceptance remain pending. No
production promotion or intake change is authorized by this repair checkpoint.

**Independent follow-up, 2026-11-03:** Rereview found that assessed early
verification-request erasure could leave surviving case/audit/round history
without exact subject authority. The code/SDD owner implemented the durable
minimal owner receipt in SDD 2.41: nullable immutable
`moderation_case.verification_subject_user_id`, with USER RESTRICT FK, exact
live-owner INSERT validation and only provable legacy-owner backfill. Unknown
legacy ownership stays unknown; retained case ownership keeps its existing
clock and survives request-first erasure, holds and bounded retries. Migration
0012 therefore includes a schema field, not only guard/view changes.

Supplied application-worker evidence reports 193/193 focused actual-D1 tests in
12 files and 7/7 metadata checks passing. These are focused worker results, not
new executions by this documentation worker or full-candidate acceptance. The
local repairs are implemented and focused-verified; independent rereview,
full-suite verification and current-candidate CI remain pending, as do merge
and publication. Dev e2bab1d and deployed ledger 0000–0011 remain unchanged;
0012 is not applied/deployed. The coordinator will record final evidence after
actual results; hosted acceptance, intake and production limits above persist.

**Later supplied verification, 2026-11-03:** The application worker reports the
full local Workers run failed: 1,298/1,308 tests passed across 52 files, with ten
failures at the unchanged five-second timeouts. The same handoff supplies passing
typecheck/lint, 193/193 focused actual-D1 tests in 12 files and 7/7 metadata
checks. These results leave complete-suite verification unresolved; they do not
establish that the candidate cannot contribute to timing failures. Current
default hosted CI and independent rereview remain pending. No full green,
browser/build, hosted acceptance, merge or deployment result is added here;
the coordinator will record final verification and delivery after actual results.

**Publication and bounded rereview clearance, 2026-11-03:**
[Draft PR28](https://github.com/slvdrvncntjvr/FLAG/pull/28) now publishes the
repairs against dev; it is unmerged. Independent rereview ctx_46d17603d775 of
commit `14baafc01b2ed52ae3dc018500a306bdef5aad98` clears the assessed-authority
blocker and finds no remaining substantive correctness issue within the bounded
repair scope. Its unchanged 20-file implementation/SDD fingerprint is
`7a9aa41ee8e992483fc567ff8538f538b21bedc15c949245802de5f1d451b524`.
Supplied 193/193 focused actual-D1 tests in 12 files, typecheck/lint and 7/7
metadata passes remain distinct from the failed full local Windows run:
1,298/1,308 passing with ten unchanged five-second timeouts, still unresolved.
Current-head default hosted CI results belong in PR28; bounded rereview does
not establish full runtime, scale or hosted acceptance. PR20's corrected title
and body are published with the PR28 link and remain draft. Dev e2bab1d,
production 3582f7e, disabled intake and deployed ledger 0000–0011 are unchanged;
0012 is unapplied, and repair delivery plus actual hosted authenticated and
D1/R2 erasure/recipient/backup acceptance remain outstanding.


**Hosted timeout and measured proof-read repair, 2026-11-03:** Default hosted
run [41607579495](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41607579495)
failed at 1,307/1,308 Workers tests: rejected-proposal expiry after R2 exceeded
five seconds; later packaging/browser steps were skipped. The measured repair
shares the exact private-log predicate and authorizes only the requested proof
without unused page arrays. Fresh viewer, relationship and natural/assessed
deadline checks remain before and after R2. Controlled same-runtime profiling
reduces per-actor read-loop D1 calls from 53 to 29 and expiry-during-GET from
33 to 17; profiling exits are diagnostic evidence, not acceptance passes.
Bounded independent review clears the four-file delta at fingerprint
`8b16358114e037985417000bf124a30ff735977e3b835b7dc17bde9c0839d08f`, including
supported schema-0008 and current-schema SQL compilation. SDD is 2.42.
The runtime-only affected set passes 192/192; typecheck/lint pass. The full
unchanged-default local run still fails at 1,301/1,311 with ten five-second
timeouts, so complete local verification remains unresolved. Original assertions,
real-action fixtures, deadlines, concurrency and migration bytes are unchanged.
PR28 needs new current-head CI for this optimization. No merge, migration,
deployment or intake change is included; existing hosted acceptance limits remain.

## 21. Controlled dev release and acceptance dependency, 2026-11-03

The owner authorized execution of PR28's backed-up migration-before-merge dev
release and controlled synthetic acceptance, including necessary defect repair
through existing protections. This does not authorize main/production mutation,
real proof intake, historical restoration, paid upgrades or manual acceptance.
All eight invariant meanings and human reconciliation dates remain unchanged.

Actual target/ledger review found only 0012 pending on dev. The existing helper
created `C:/Users/Vincent/FLAG-backups/flag-dev-20261103T105738793Z-792f2207.sql.dpapi`
at 10:57:45 UTC and verified DPAPI CurrentUser decrypt, byte length and SHA-256
in memory, with operation plaintext cleanup confirmed. This fresh artifact
preceded migration; it establishes encrypted byte recovery, not restore safety
or completed assessed backup disposition. INDEX owns merge/deployed state;
QAD §1.4 owns actual hosted coverage and gaps.

Normal dev protections remained enforced: strict verify/dependency-audit checks,
administrator enforcement, no force push/deletion and no admin merge bypass.
The original repair branch and its 352603-byte evidence archive are preserved.
The migration leaves published SQL and old consent/decision clocks unchanged;
read-only post-apply foreign keys and provable verification-owner matches pass.
The prior Worker has readable additive schema through deployment, but old
verification creation omits the new immutable owner field and fails closed
during the migration/build interval; no interim verification submission was
attempted or asserted successful.

Hosted anonymous probing exposed an export HTTP early-denial header gap:
missing nosniff before resource access, while the shared export handler already
sets it. Necessary repair is scoped to that route and its regression. No proof
or account data was exposed by the probe. No authenticated browser was present;
actual dev inventory has no admin, one moderator, three verified controlled
freelancers, and no logs/tasks. Controlled inbox/staff access and actual named
processor assessment/private delivery inputs are needed; the operator must not
invent account-control, receipt or physical-copy evidence. Intake stays false
and synthetic workflow acceptance remains incomplete. The known deleted LOG
checkpoint finding and failed Windows evidence remain visible and preserved.

## 22. Export-denial repair delivered; authenticated inputs pending, 2026-11-03

The coordinator directed continued independent repair/release verification while
human inbox/session and named-processor inputs remain pending. PR29 repairs the
observed early export-denial headers without changing the schema, authority or
retention rules. Focused HTTP/real-D1/R2 privacy tests pass 19/19, typecheck/lint
pass, and full hosted candidate CI passes with unchanged limits. It merged
normally through unchanged dev protections, and its normal Workers Build names
the exact version observed at 100%. INDEX owns the source/version and CI receipts;
QAD §1.4 records fresh hosted success and preserves the initial failure.

A check during the build still observed the old version and failed export
headers; these are retained as `temporary/pr29-dev-during-build.json` and
`temporary/pr29-anonymous-during-build.json`, not mislabeled repaired deployment
evidence. Subsequent checks after the successful build confirm the new version,
all anonymous denial headers and actual intake=false. No new migration, intake
enablement, session fabrication, existing-user role change, historical restore,
production mutation or owner manual acceptance occurred. Original repair and
follow-up branches, archive and Windows timing failures remain preserved.

Actual eligibility is narrower than verified-profile count: three active
verified controlled freelancers, one satisfying all current policies. Existing
historical policy and engagement-consent versions remain present. The absence
of an admin/authenticated controlled sessions and actual processor/handover
inputs still blocks truthful execution of assessed lifecycle, physical erasure,
independent correction/publication and record/rating acceptance. Keep intake
false and return the exact human-access needs through Orca; source/CI/anonymous
success cannot settle these unexecuted workflows.

## 23. Authenticated synthetic acceptance and held-action repair, 2026-11-03

The owner supplied the existing verified freelancer's authenticated Orca dev
session and broad authorization to carry necessary work toward production.
The immediate execution phase remains controlled dev acceptance. Dedicated
synthetic roles/fixtures and supported processing may proceed without repeating
permission questions; account control, human publication decisions and owner
manual acceptance must still describe real observed actions. No existing user's
role was changed, and main/production and real intake remain unchanged.

The owner completed normal private OTP entry for a new isolated processor.
Its supported scoped metadata export was received and parsed in the same
subject's browser, refused without its session and on replay, and independently
confirmed absent in R2 with cleared D1 token/object tracking. The recorded
recipient receipt explicitly describes automated browser observation; it is
not a claim of owner manual acceptance. QAD owns the observed coverage.

An exact finite hold retained one synthetic processor audit row. The deployed
staff execution returned unavailable because task issuance rejected that held
target before other assessed actions could run. After supported hold release,
the staff retry physically erased the row and recorded its exact completed
task on one claim. Backup inventory is still unverified; this is a scoped live
row/artifact result, not completed erasure of every retained copy. A focused
runtime regression reproduced unavailable and then passed with the repair;
the 17-test privacy suite passes. The candidate now preserves held work,
continues unrelated eligible actions and reports pending held counts while
retaining the database's exact issue/claim/use guards. INDEX owns delivery.

The Orca Codex worker hit an explicit account usage limit after preparing the
export. Guarded stop confirmed its process stopped and its transcript was
preserved. The configured Claude fallback could not start because its official
runtime path was missing; the failed launch was inspected and released without
running the task. No credits/upgrade were purchased or agent installation
changed. The coordinator continued through Orca's browser and scoped read-only
inspectors, preserving the original release and Windows failure evidence.

One earlier browser submission remained pending without a recorded task; fresh
native form execution supplied the observed held error and later physical
erasure. Bounded diagnostic reads found ordinary auth/home reads working,
13 ms staff-target SQL and 61 ms EXPLAIN compilation; these do not identify the
pending submission's cause or resolve the separate Windows test timeouts.
No timeout was increased and no uncertain purge owner was adopted. Closure,
independent correction/publication, records/ratings and owner manual acceptance
remain incomplete; the disposable closure subject needs its normal private
sign-in before testing deactivation without closing the owner's real account.
