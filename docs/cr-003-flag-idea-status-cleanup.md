---
spine_type: CR
spine_version: 0.3.0
project: FLAG
slug: flag
cr_id: cr-003
doc_version: 0.1
status: Review
owner: slvdrvncntjvr
created: 2026-10-30
updated: 2026-10-30
reconciled: 2026-10-30
---

# Change Record 003: Remove stale status and correct cap wording in IDEA

**Target doc:** idea-flag.md (status at time of CR: `Locked`)
**Requested by:** Owner, as part of the 2026-10-30 docs cleanup (LOG §1).

---

## 1. What changes

Two wording fixes in idea-flag.md. No scope, exclusion, invariant, metric or constraint changes.

1. §6 Constraints, Time row: remove the sentence "As-built today is auth/onboarding only (PRD-F7, PRD-F8); other product flows are planned". Build status belongs in INDEX §6, not in the idea brief.
2. §7 Open questions, resolved Q7 bullet: "daily invite/log quotas per freelancer" becomes "daily and weekly invite quotas and a weekly log quota per freelancer". This matches the caps the owner approved on 2026-10-13 (LOG §1 lock-in row: invites 10/day and 30/week, logs 10/week) and SDD §5 Rate limiting.

## 2. Why

The as-built sentence went stale once verification and engagements were released on dev (INDEX §6). The cap wording said logs had a daily quota, but the approved cap is weekly.

## 3. Before and after

| | Before | After |
|--|--------|-------|
| IDEA §6 Time row | Ends with an as-built status sentence | Course schedule only |
| IDEA §7 Q7 caps | "daily invite/log quotas" | "daily and weekly invite quotas and a weekly log quota" |
| IDEA status | 1.0 Locked | 2.0 Review until the owner re-locks it |

## 4. Propagation

| Artifact | Kind | Change needed | Done |
|----------|------|---------------|------|
| idea-flag.md | doc | Apply both wording fixes; bump to 2.0 Review | yes |
| index.md | doc | Register cr-003; update IDEA row | yes |
| build-flag.md | doc | Stop calling IDEA "Locked" | yes |
| log-flag.md | doc | Record the decision | yes |
| prd-flag.md, sdd-flag.md, qad-flag.md | doc | None; they already state the approved caps and status lives in INDEX | n/a |
| code | code | None | n/a |

## 5. Risk

None to product behavior. IDEA is in Review until the owner re-locks it. Scope, exclusions and all eight invariants are unchanged, so building against them is unaffected.

## 6. Approval

| Role | Who | Date | Decision |
|------|-----|------|----------|
| Owner | slvdrvncntjvr | 2026-10-30 | Approved as part of the docs cleanup ("yes docs cleanup and cleanup what can be cleanedup") |
