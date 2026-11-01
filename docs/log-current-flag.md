---
spine_type: LOG
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.10
status: Draft
owner: slvdrvncntjvr
created: 2026-10-31
updated: 2026-11-01
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
| 2026-11-01 | Owner authorizes implementing the prior review recommendations, verifying the candidate and merging dev-2 into dev while docs remain Review | Restore PRD-F9 city wording and require city for new client profiles only; existing profiles including legacy NULL city remain reusable, freelancer verification city remains optional, no migration/backfill. Repair composed government-ID URL labels with bounded decoding, separate query pairs and first/corrected-submission zero-write regressions. Preserve SPINE 0.3.0, invariants, owner work and historical rows; retain the known checkpoint deletion finding. Final checks, review and merge outcomes remain pending in INDEX; no deployment or human acceptance is implied | PRD, SDD, QAD, BUILD, INDEX, current LOG |
| 2026-11-01 | Hold dev-2 integration after independent run run_7438fbbffbd0 finds a residual R1 verification-URL privacy blocker | Three reviews completed: tooling has no substantive finding, documentation flags qualified city-optionality drift, application finds a composed-label bypass. Earlier passing checks remain dated evidence; main is assessment only and no hosted/human/full-product certification follows | INDEX, current LOG |
| 2026-11-01 | Scoped audit repair disables persisted Workers logs and traces in both source environments while retaining fixed application event emission | Invocation suppression alone does not establish that custom-log metadata omits capability URLs. Avoid default platform retention at the cost of stored console diagnostics; no configured exports, Tail consumer or Logpush. Actual hosted overrides/history remain uninspected and unchanged; OPS records the operator-channel and historical-retention limits | OPS, SDD, QAD, INDEX, current LOG |
| 2026-10-31 | Owner authorizes execution of the audit implementation plan with supervised Orca workers while the governing docs remain Review | Repair R1–R10, compatible dependency advisories and Windows lifecycle verification locally; preserve existing work, SPINE 0.3.0 and invariant meanings. Deny unused OTP checks, bind consent to displayed profile state, authorize explicit removal atomically, count removal as activity, and align inspection wording with existing reviewer semantics. No deployment, remote migration, intake enablement, commits, checkpoints or history restoration | SDD, QAD, BUILD, OPS, INDEX, current LOG |
| 2026-10-31 | Owner intentionally removed the archive and original LOG, explaining that the current LOG was its replacement | Keep current context concise; record that replacement of startup context does not preserve historical evidence. Do not restore automatically. No external backup is verified | INDEX, current LOG, AGENTS.md |
| 2026-10-31 | Owner authorizes a full documentation overhaul and web assessment on new branch dev-2, accepting the recommendation to reduce routine context | Preserve approved product meaning and all eight invariants; make current status, requirements, source contracts, commands and remaining work easy to find. This authorizes this consolidation and factual web-copy repairs. It does not authorize deployment, remote migration, paid services, or automatic implementation of the remaining product | INDEX, BUILD, PRD, SDD, QAD, OPS, LOG, AGENTS.md, web/README.md |
| 2026-10-31 | Keep historical proposals and receipts outside routine reading; retain the old log as Superseded for append-only checkpoint compatibility | Exact original working-tree docs are archived with hashes. No previous owner decision is retrospectively invented. Current decisions are stated directly in their owning document; old release gates and superseded Open rows are historical | INDEX, LOG, AGENTS.md |
| 2026-10-31 | Resolve Q27 under the owner's delegated engineering judgment: retain existing optional Messenger external-browser help | It is support copy for file selection, adds no reputation or client feature, and creates no Messenger/device acceptance requirement. No new helper implementation is needed | PRD, BUILD, LOG |

## 2. Open questions

**2026-11-01 update:** The owner accepted restoration of PRD-F9's original city
wording and enforcement for new client profiles, preserving existing profiles.
The city question recorded below is resolved by the new decision above; its
earlier wording is retained as review history. INDEX owns pending repair,
verification and integration status.

None blocking this consolidation. Future lifecycle/correction implementation
needs a completed technical design, listed in INDEX; that is engineering work,
not a request to reconfirm settled product decisions.

Current readiness review leaves city optionality unresolved: PRD-F9 now explicitly
calls city optional, while the prior PRD lists city and calls only registration
optional. Source optionality predates consolidation and does not establish owner
intent. Preserve this qualified discrepancy for resolution without changing PRD
or inferring a new requirement; see section 9. The residual R1 privacy defect
holds merge independently of that wording question.

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
