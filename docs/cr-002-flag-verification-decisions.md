---
spine_type: CR
spine_version: 0.3.0
project: FLAG
slug: flag
cr_id: cr-002
doc_version: 0.2
status: Review
owner: slvdrvncntjvr
created: 2026-10-26
updated: 2026-10-26
reconciled: 2026-10-26
---

# Change Record 002: Clarify verification decisions

**Target doc:** prd-flag.md (status at time of CR: `Locked`)
**Requested by:** Coordinator proposal during the owner's 2026-10-26 implementation request; owner accepted the explicit recommendation on 2026-10-26, as relayed in the docs-update dispatch.

## 1. What changes

Owner approved replacing the PRD-F4 decision acceptance bullet with exactly:

> Verification decisions are approve or reject; a rejected freelancer may submit a new corrected request, retaining the previous request and decision. Log and filer-update decisions are approve, ask-changes, or reject. Correction decisions are uphold, ask-changes, correct, or withdraw the publication. Approve and reject both require a reason. Every claim, decision, and release is written to an append-only audit trail with its history.

Applied to prd-flag.md as 2.0 Review on 2026-10-26 under engine §7.3. The feature-table decision summary now points to the kind-specific acceptance criteria to avoid contradicting the approved bullet; no other requirement scope, invariant, inspection method, schema field, retention rule or moderator permission changes.

## 2. Why

The former PRD-F4 general decision bullet included ask-changes without distinguishing verification. PRD-F1 describes approval/rejection; Review SDD §3.5 explicitly specifies verification approve/reject and new-request resubmission. The local decision schema enforces approve/reject (`web/src/features/moderation/schema.ts:9`), and the handler applies the reasoned decision atomically (`web/src/features/moderation/handlers.ts:55`). The owner approved clarifying that existing contract rather than adding a verification transition.

## 3. Before and after

| Aspect | Before | Approved after |
|--------|--------|----------------|
| Verification | General queue wording may imply ask-changes; specific design supports approve/reject | Explicit approve/reject with corrected resubmission as a new request |
| Logs and filer updates | Approve/ask-changes/reject | Unchanged |
| Corrections | Uphold/ask-changes/correct/withdraw | Unchanged |
| History | Append-only review history | Unchanged; earlier verification requests remain |

## 4. Propagation

| Artifact | Kind | Change needed | Done |
|----------|------|---------------|------|
| prd-flag.md | doc | Apply exact approved bullet; narrow summary cross-reference only | yes; 2.0 Review, updated 2026-10-26; invariants and other requirements preserved |
| sdd-flag.md | doc | Confirm §3.5 decision/resubmission compatibility and component summary | yes; 2.11 Review, approved contract and local evidence cited |
| qad-flag.md | doc | Make kind-specific decision/resubmission coverage and actual results explicit | yes; 2.22 Review, S-34 names verification ask-changes rejection; §1 distinguishes local review, hosted checks and release gates |
| index.md, log-flag.md | doc | Record approval, propagation, Q25 resolution and current release authority | yes; INDEX 0.47 Draft and LOG 1.38 Draft; prior LOG rows preserved |
| web/src/features/moderation/schema.ts, web/src/features/moderation/handlers.ts | code | Review current approve/reject enforcement; no behavior change proposed | compatible; read-only inspection plus completed independent code review reports no blocking finding; no code edited by this CR |
| web/tests/f01-verification.test.ts, web/tests/f01-verification-schema.test.ts | test | Retain reasoned rejection, corrected resubmission and history checks | existing passing local coverage: f01-verification.test.ts:137 retains two requests after corrected resubmission; f01-verification-schema.test.ts:65 protects decided history and rejects wrong-kind outcomes |

## 5. Risk

This clarification does not complete the full PRD-F4 queue: log/filer-update and correction workflows remain separate implementation gates. Baseline runtime/release controls remain independent of the F1 candidate. Contract approval is not human reconciliation, document lock, protected-branch developer approval or production release approval; reconciled dates are unchanged.

## 6. Approval

| Role | Who | Date | Decision |
|------|-----|------|----------|
| Owner | slvdrvncntjvr | 2026-10-26 | Approved the exact §1 bullet: verification approve/reject, corrected new request after rejection preserving history; apply the bounded PRD/SDD/QAD propagation |

The same owner authorization accepted publishing the baseline child as a PR into dev, merging only after hosted checks and real independent developer approval, then exact-version live verification, while preparing F1 separately and holding main/production. PR #15 at aa90465 is published and both hosted checks passed; independent developer approval remains required, with no merge/deployment recorded. LOG records this release authority and Q25 resolution without rewriting the earlier proposal. No reconciled advance or new checkpoint is authorized by this approval.
