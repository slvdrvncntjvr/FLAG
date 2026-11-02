---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.97
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-11-02
reconciled: 2026-09-14
---

# FLAG: current project reference

**Project slug:** `flag` - **Tier:** 3 - Product - **Owner:** slvdrvncntjvr

Built on SPINE 0.3.0

Start with the [current baseline](#6-current-development-baseline) and
[remaining work](#7-remaining-work). For a coding task, read IDEA §4-4.1, the
relevant PRD acceptance criteria, SDD contract and BUILD command. Read QAD for
verification and OPS for operations. The active decision log is
[log-current-flag.md](log-current-flag.md).

## 1. Document Suite

| Document | File | Version | Status | Updated | Reconciled |
|----------|------|---------|--------|---------|------------|
| IDEA: scope and invariants | [idea-flag.md](idea-flag.md) | 2.1 | Review | 2026-10-31 | 2026-10-13 |
| BUILD: setup, commands and conventions | [build-flag.md](build-flag.md) | 2.43 | Review | 2026-11-02 | 2026-10-13 |
| PRD: approved product requirements | [prd-flag.md](prd-flag.md) | 2.3 | Review | 2026-11-01 | 2026-10-13 |
| SDD: source schema and technical contracts | [sdd-flag.md](sdd-flag.md) | 2.39 | Review | 2026-11-02 | 2026-10-13 |
| QAD: test coverage and acceptance | [qad-flag.md](qad-flag.md) | 2.53 | Review | 2026-11-02 | 2026-10-13 |
| OPS: release and recovery procedures | [ops-flag.md](ops-flag.md) | 2.44 | Review | 2026-11-02 | 2026-10-13 |
| LOG: current decisions and open questions | [log-current-flag.md](log-current-flag.md) | 0.15 | Draft | 2026-11-02 | 2026-09-14 |

Review means the owner has not newly reconciled or locked the consolidated text.
The owner explicitly authorized this overhaul and factual web-copy changes on
`dev-2`; that authorization is recorded once in the current LOG and cr-004.
New feature implementation still needs the scope of its actual task.
The subsequent scoped repair/verification/dev-merge authorization is recorded in
the current LOG; it does not newly lock or reconcile these Review documents.
On 2026-11-02 the owner explicitly authorized the remaining approved pilot on
`feat/pilot-readiness-20261102`: necessary design/schema/implementation while
docs remain Review, then backed-up dev migrations/deployment and synthetic
acceptance intake only after prerequisites. Main merge needs later owner
approval; no paid upgrades or optional features. See current LOG §14 for scope
and the limited owner acceptance report; no human reconciled date advances.

Root pointers: AGENTS.md, CLAUDE.md, GEMINI.md and IDE rules. Local web setup
starts at [web/README.md](../web/README.md).

### 1.1 Historical and deferred references

These are excluded from normal session reading.

| Reference | File | Status | Use |
|-----------|------|--------|-----|
| Original LOG | `docs/log-flag.md` (removed) | Historical, owner-deleted 2026-10-31 | Committed history remains in git; deleted uncommitted additions are not verified recoverable |
| Pre-overhaul snapshot | `archive/docs-2026-10-31/` | Historical, owner-deleted 2026-10-31; untracked local copies observed 2026-11-01 | New copies left untouched; continuity with the deleted working history and external backup remain unverified |
| flag-rfc-001 | [rfc-flag-id-check.md](rfc-flag-id-check.md) | Draft, deferred | Future QR feasibility only; manual inspection is the pilot method |

The owner intentionally removed the original LOG and archive after consolidation.
The active LOG replaces routine session context, not the deleted historical
evidence. Checkpoint verification against `spine-cp-2026-10-26-1` therefore reports
the missing original LOG. This is a recorded deletion, not a clean checkpoint
result; do not suppress it or restore history without owner approval.

## 2. Change Log

Change records against `Locked` documents. See engine §7.3.

| CR ID | Date | Summary | Trigger doc | Docs touched | File |
|-------|------|---------|-------------|--------------|------|
| cr-001 | 2026-10-14 | Owner-approved audit repairs, retained build-guide edits, and durable authentication throttling; implementation authorized while changed docs are Review | BUILD, SDD | build-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md | [cr-001-flag-audit-fixes.md](cr-001-flag-audit-fixes.md) |
| cr-002 | 2026-10-26 | Owner-approved verification approve/reject with corrected new-request resubmission preserving history; applied, CR 0.2 Review, LOG Q25 resolved | PRD | prd-flag.md 2.0 Review, sdd-flag.md 2.12 Review, qad-flag.md 2.23 Review | [cr-002-flag-verification-decisions.md](cr-002-flag-verification-decisions.md) |
| cr-003 | 2026-10-30 | Owner-approved wording fixes: remove the stale as-built sentence from IDEA §6 and correct the Q7 cap wording to match the approved weekly log quota; no scope or invariant change | IDEA | idea-flag.md 2.0 Review, build-flag.md, index.md, log-flag.md | [cr-003-flag-idea-status-cleanup.md](cr-003-flag-idea-status-cleanup.md) |
| cr-004 | 2026-10-31 | Owner-authorized documentation consolidation and factual landing copy; requirements and invariants retained | IDEA, BUILD, PRD, SDD, QAD, OPS | idea-flag.md, build-flag.md, prd-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md, index.md, log-flag.md, log-current-flag.md | [cr-004-flag-documentation-consolidation.md](cr-004-flag-documentation-consolidation.md) |

## 3. Traceability Matrix

In SDD/QAD means reference coverage. Design completeness is stated in SDD section 6; implementation status is stated in INDEX section 6.

| PRD-F# | Feature | Priority | In SDD | In QAD | In RFC |
|--------|---------|----------|--------|--------|--------|
| PRD-F1 | Freelancer verification | Must-Have | yes | yes | flag-rfc-001 |
| PRD-F2 | Structured engagement log | Must-Have | yes | yes | N/A |
| PRD-F3 | Mandatory proof upload | Must-Have | yes | yes | N/A |
| PRD-F4 | Moderation queue | Must-Have | yes | yes | N/A |
| PRD-F6 | Client record | Must-Have | yes | yes | N/A |
| PRD-F7 | Accounts and sign-in | Must-Have | yes | yes | N/A |
| PRD-F8 | Onboarding and legal acknowledgment | Must-Have | yes | yes | N/A |
| PRD-F9 | Client registration and engagement handshake | Must-Have | yes | yes | N/A |
| PRD-F12 | Personal data and retention handling | Must-Have | yes | yes | N/A |
| PRD-F13 | Private review and correction | Must-Have | yes | yes | N/A |
| PRD-F14 | Engagement and client ratings | Must-Have | yes | yes | N/A |

Retired, excluded from Must-Have coverage: PRD-F5 (right of reply, Dropped; QAD H-05/S-09/AB-09 reserved) and PRD-F10 (corroboration, Dropped; QAD H-10/S-15/AB-16 reserved). IDs retained, never reused. flag-rfc-001 is a deferred design reference, not a launch requirement.

### 3.1 Invariant Matrix

| INV-# | Rule | Status | Enforced in | Negative test |
|-------|------|--------|-------------|---------------|
| INV-1 | Never publish a log a moderator has not approved | Active | SDD §5.1; target §3.8 human round and exact proof receipts | NT-01, NT-02, NT-11, NT-13 |
| INV-2 | Never accept a log without proof or without an accepted engagement | Active | SDD §5.1: `submitLog`, trigger `log_requires_proof`; target §3.8 | NT-03, NT-04, NT-14 |
| INV-3 | Never store a raw ID image or full ID number | Active | SDD §5.1: auth user-write hooks and verification handlers | NT-05, NT-15 |
| INV-4 | Never show proof outside moderators, filer, named client | Active | SDD §5.1: `/api/proofs/[id]`; target scoped exports §3.10 | NT-06, NT-16 |
| INV-5 | Never compute or show an unapproved reputation signal; only the approved 1-5 rating and client average are permitted | Active | SDD §5.1; target §3.12 shared eligible rating projection | NT-07, NT-12, NT-17 |
| INV-6 | Never let a client edit or delete a published log | Active | SDD §5.1; target §§3.9–3.11 private corrections and exact maintenance scopes | NT-08, NT-18 |
| INV-7 | Never serve client records or logs to signed-out visitors or crawlers | Active | SDD §5.1: `(app)` layout, noindex, robots; target §3.12 | NT-09, NT-19 |
| INV-8 | Never let an unverified or unacknowledged freelancer open an engagement or file a log | Active | SDD §5.1: `requireVerifiedFreelancer()`; target closure guard §3.10 | NT-10, NT-20 |

---


## 4. Incident Log

No product postmortem is registered. Current recovery context is in the current
LOG §5. Earlier committed recoveries can be investigated through git history.

## 5. Health Check

Run from the repository root:

```powershell
python scripts/spine.py check docs/
python scripts/spine.py checkpoint verify
```

The validator checks structure and traceability; the checkpoint checks preserved
history and recorded changes. App correctness needs the checks in QAD. Human
`reconciled` dates are carried forward, never advanced by an agent.

## 6. Current development baseline

This is the only current delivery-state map. The reviewed consolidation and audit
repairs were integrated into dev through [PR24](https://github.com/slvdrvncntjvr/FLAG/pull/24)
and the [PR25](https://github.com/slvdrvncntjvr/FLAG/pull/25) notice follow-up on
2026-11-01. Hosted facts below are dated observations carried from the prior
coordinator audit `run_f8e7c3f97f0b`, not fresh checks in this design task. That
release record had no authenticated human acceptance; the narrower owner report
received 2026-11-02 is stated below.

| Capability | Local source | Last recorded dev |
|------------|--------------|-------------------|
| Email-code accounts and policy onboarding | Implemented | Available |
| Manual freelancer verification and moderator review | Implemented; approve/reject, corrected new requests, immutable submitted profile history | Available |
| Engagement invitations and explicit client consent | Implemented; accept/decline/cancel, separate per-engagement receipt | Available |
| Private log draft, proof upload and initial submission | Implemented through pending; new intake disabled | Source integrated; intake disabled |
| Log moderation/publication, client search/records and aggregate ratings | Implemented on the pilot feature branch; bounded source reviews and final application/browser checks pass; PR26 integration pending | Unavailable |
| Full retention, assessed account closure/export, private corrections and filer updates | Implemented on the pilot feature branch; reviewed repairs and application/browser checks pass; verified dev backup/migrations precede PR26 merge | Unavailable |
| Optional feature notifications | Deferred; sign-in email is implemented separately | Unavailable |

| Location | Last recorded revision | Schema |
|----------|------------------------|--------|
| Dev: `flag-dev`, branch `dev` | PR25 deployed baseline `4f216e9` (includes PR24 `cde6943`); prior audit observation 2026-11-01 | 0000-0008; 0009 in source, unapplied |
| Production: `flag`, branch `main` | `3582f7e`; accounts/onboarding baseline, predates PROOFS binding | 0000-0007 |

PR24 preserves the prior dev-2 work and published SQL. Generation metadata covers
0008-0009; required new-profile city needed no migration or legacy backfill.

`PRIVATE_INTAKE_ENABLED` is `"false"` in both source environments
(`web/wrangler.jsonc:39`). Enabling it requires the prerequisite below; the flag
is not a completion signal. Existing authorized private log/proof reads remain
available while new writes are disabled (`web/src/features/logs/rollout.ts:6`,
`web/src/app/(app)/logs/[id]/page.tsx:13`).

The deployed baseline privacy/terms versions are `2026-11-01`; the pilot feature
branch prepares `2026-11-02` notices and current-policy database authority.
Freelancer acknowledgment and
engagement consent remain `2026-10-12` (`web/src/lib/policies.ts:8`). The notice
alignment/reacceptance follow-up is delivered through [PR25](https://github.com/slvdrvncntjvr/FLAG/pull/25);
the pilot release requires current privacy/terms acknowledgment under the existing
PRD-F8 gate. Existing engagement-consent history is unchanged. Staff roles are assigned
in D1; the documented release baseline has no admin screen. The prior audit
observed the current notice versions and successful PR25 delivery; this task
performs no new hosted verification. On 2026-11-02 the owner reports current dev
signup, verification and moderation working, without naming further scenarios.
This is limited owner-reported acceptance, not acceptance of log publication,
lifecycle, corrections, records, ratings or production readiness.

The dated PR25 evidence is required CI
[41316804137](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41316804137),
merge-push CI [41317518481](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41317518481)
and PR20 CI [41317522530](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41317522530)
success, successful Workers Builds, and dev version
`89181aec-0257-499b-b770-1260e64698c1` at 100%, created
`2026-11-01T14:44:47Z`, as observed by that prior audit. The notice probe passed
the visible `2026-11-01` versions. These receipts correct the earlier PR24-only
deployed label; they do not establish later hosted state.

The source blockers from [current LOG section 9](log-current-flag.md#9-independent-readiness-review-2026-11-01)
are repaired under the owner's follow-up authorization. Composed government-ID
URL labels and original Unicode hostnames reject before persistence; safe
portfolio URLs retain their original bytes. PRD-F9 city wording and new-profile
enforcement agree. Existing profiles, including legacy NULL city, remain reusable;
freelancer verification city remains optional. Independent follow-up reviews found
no remaining substantive issue within these bounded repairs; see current LOG
section 11. Integration and final verification are recorded in section 12.

Post-release Cloudflare checks on 2026-11-01 confirm dev invocation logging and
log/trace persistence disabled, tracing off, no Tail consumers or Logpush, correct
DB/PROOFS/auth URL bindings and intake false. Nine established read-only page
probes pass; anonymous proof access returns 404/no-store. The HTTP session probe
was omitted because its limiter writes counters. No retained log content was
inspected or deleted, and no remote migration ran.

Production remains unchanged with invocation logging/persistence enabled, schema
0000-0007 and no Worker PROOFS binding. Its named private bucket exists. Before
promoting this baseline to main, follow OPS section 7: back up and apply the
compatible reviewed migrations, bind private proofs and perform the intended
shipped-slice acceptance. Keep intake disabled and the lifecycle prerequisite.

Final source verification passes 1,047 Workers tests across 35 files, typecheck,
lint, 61 tooling tests, five setup tests and three runner tests. Dev build,
no-upload packaging, packaged smoke and all 18 desktop/mobile browser scenarios
pass. Both complete local harnesses exit 0 with verified teardown, free ports
and removed owned data. Required [hosted CI](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41314347205)
passes for candidate `e20d450`. Production audit
reports zero advisories; the full graph retains 15 moderate development-package
entries and no high/critical findings. This does not establish dependency
non-exploitability.

Earlier verification remains dated evidence in current LOG sections 6-11; the
final browser result includes the required-city setup correction. PR25 aligns
client-city notices and their versions; its checks track that follow-up separately
from the accepted PR24 baseline. SPINE normal
validation passes with its deferred-RFC warning, while the recorded old-LOG
checkpoint deletion finding stays visible. Main remains assessment only; this
baseline does not complete the remaining product or broaden the limited owner
report above. The feature branch's design and implementation work is not yet a
deployed capability.

## 7. Remaining work

| Order | Deliverable | Scope |
|-------|-------------|-------|
| 1 | Implement and verify the designed lifecycle/correction workflow | PRD-F12, PRD-F13: SDD §§3.8–3.11 defines responsible requests/outcomes, secure export, assessed closure/access revocation, physical erasure/backup disposition, bounded holds and independent correction/update rounds |
| 2 | Implement log review and publication | PRD-F4, INV-1: log queue, claim, approve/ask-changes/reject, reason/history and publication transition; additive migration after lifecycle migrations |
| 3 | Enable only authorized acceptance intake on dev after verified prerequisites | Apply reviewed migrations starting at 0009 to backed-up dev, align privacy/terms versions, deploy and perform isolated synthetic acceptance; owner smoke and real-proof readiness remain explicit, OPS §5 |
| 4 | Implement client search, records and aggregates | PRD-F6, PRD-F14: latest eligible rating per contributor, counts, tags, Limited record and empty state |
| 5 | Promote the intended product slice when the owner chooses | Green CI and manual smoke; OPS §7 |

Email can receive pilot privacy requests when the named owner processes and
records them. Minimum safe lifecycle and correction capabilities must exist
before **real proof collection or publication**. Read-time hiding does not
perform erasure. A polished self-service request interface may follow later.

Lifecycle and log moderation share an authorized implementation milestone using
synthetic data while development intake stays disabled. The design-first ERD,
register/constraints and concrete interfaces are now in SDD §3/§4.1; schema and
feature implementation must follow them after independent design review. The
feature branch now contains the designed entities, new migrations 0010/0011,
staff tools, review flows and records. The candidate remains on the feature
branch and unapplied remotely while final integration is completed. Independent source reviews found
eight defects across writer ownership, retention deadlines and claim recovery;
the repairs were independently reread and exercised by focused tests. Further
dev-merge review found exact typed-OTP cleanup, assessed read-deadline and
proof-denial-header gaps. The repairs pass their focused runtime sets and bounded
independent source rereview. The final local Workers suite passes 1,273 tests in
48 files; all 22 desktop/mobile browser scenarios pass with verified teardown,
free port and successful-run data removed. The local Windows browser run uses
the documented explicit 30-minute suite allowance; hosted Linux passes its
unchanged default. Candidate ef890aa passes both required checks in
[PR26 run 41456648042](https://github.com/slvdrvncntjvr/FLAG/actions/runs/41456648042),
including the packaged scheduled handler, 19-route smoke and no-upload packaging.
Typecheck/lint, tooling/setup/Python checks and production audit pass; the full
dependency graph retains 15 moderate development findings, no high/critical.
The first encrypted dev backup attempts failed without verified artifacts.
Native process handling and the installed export confirmation flag are repaired;
the 2026-11-02 14:30 UTC dev backup passes decrypt/length/SHA-256 verification
with plaintext cleanup confirmed. Ten Python tests pass, including synthetic
native-stream, argument and actual local CLI-parser cases. Remote migration and
merge still follow current candidate checks and the reviewed OPS sequence.
Later candidate changes require their current checks. Preserve ordinary freeze
guards and add only the scoped
maintenance path. This is work in progress, not a completed release,
remote physical-erasure evidence, dev migration/deployment or full acceptance.

Deferred: notifications, QR automation, and unapproved PRD §6 candidates. All
IDEA exclusions and eight invariants continue to apply. This queue describes
remaining approved pilot scope under the 2026-11-02 authorization; optional and
excluded features remain outside it. Main merge still needs later owner approval.
