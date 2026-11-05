---
spine_type: CR
spine_version: 0.3.0
project: FLAG
slug: flag
cr_id: cr-004
doc_version: 0.1
status: Review
owner: slvdrvncntjvr
created: 2026-10-31
updated: 2026-10-31
reconciled: 2026-09-14
---

# Change Record 004: documentation consolidation

**Target doc:** idea-flag.md, build-flag.md, prd-flag.md, sdd-flag.md, qad-flag.md,
ops-flag.md, index.md, log-flag.md (currently Review/Draft; the original LOG is
being marked Superseded).
**Requested by:** slvdrvncntjvr.

## 1. What changes

Replace repeated status and session narratives with concise current references.
Keep the current source schema in the SDD ERD. Describe unfinished lifecycle and
correction contracts as work to design, without claiming their tables or handlers
exist. Keep approved product requirements and invariant meanings unchanged.

## 2. Why

The owner reported excessive context drift and explicitly authorized a full
overhaul on dev-2 after accepting the recommendation to shrink routine context.

## 3. Before and after

| Aspect | Before | After |
|--------|--------|-------|
| Current state | Mixed with proposals, repeated gates and receipts | One status map in INDEX, with dated remote observations |
| History | Large LOG read during startup | New short active LOG; original LOG Superseded with every past row preserved |
| Schema | Built and incomplete future entities mixed in one diagram | ERD matches source; future changes require design before migration |
| Web introduction | Unfinished product features described as available | Landing page explains current availability and planned capabilities |

## 4. Propagation

| Artifact | Kind | Change needed | Done |
|----------|------|---------------|------|
| idea-flag.md, index.md, build-flag.md, prd-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md | doc | Consolidate current reference and retain stable IDs; IDEA invariant rows unchanged | yes |
| log-flag.md, log-current-flag.md | doc | Preserve original history and start concise current log | yes |
| AGENTS.md, web/README.md, .rgignore | doc/config | Task-specific reading, history excluded from default search, and one authoritative location per fact | yes |
| web/src/app/(public)/page.tsx | code | Correct availability wording | yes |
| archive/docs-2026-10-31/ | evidence | Exact pre-edit snapshot with hashes | yes |

## 5. Risk

Compression can drop a real requirement. Preserve every invariant and feature ID,
check acceptance coverage, compare the ERD with source, retain exact originals,
and run documentation validation and the relevant app checks. Review status and
human reconciliation dates are preserved; this is not a new owner acceptance or
release claim.

## 6. Approval

| Role | Who | Date | Decision |
|------|-----|------|----------|
| Owner | slvdrvncntjvr | 2026-10-31 | Explicit permission to overhaul docs and assess web on dev-2; proceed with the recommendation |
