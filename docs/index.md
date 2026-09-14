---
spine_type: INDEX
spine_version: 0.2.0
project: FLAG
slug: flag
doc_version: 0.1
status: Draft
owner: TBD(owner)
created: 2026-09-14
updated: 2026-09-14
reconciled: 2026-09-14
---

# Documentation Index: FLAG

**Project slug:** `flag`
**Tier:** 2 - Application
**Maintained by:** TBD(owner)

Built on SPINE 0.2.0

---

## 1. Document Suite

| Document | File | Version | Status | Updated | Reconciled |
|----------|------|---------|--------|---------|------------|
| IDEA · Idea Brief | [idea-flag.md](idea-flag.md) | 0.1 | Draft | 2026-09-14 | 2026-09-14 |
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 0.1 | Draft | 2026-09-14 | 2026-09-14 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 0.1 | Draft | 2026-09-14 | 2026-09-14 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 0.1 | Draft | 2026-09-14 | 2026-09-14 |
| QAD · QA and Test Plan | n/a | n/a | N/A (tier 2; QAD is tier 3) | n/a | n/a |
| OPS · Ops and Observability | n/a | n/a | N/A (tier 2; OPS is tier 3) | n/a | n/a |
| LOG · Session Log | [log-flag.md](log-flag.md) | 0.1 | Draft | 2026-09-14 | 2026-09-14 |

**Materialized at repo root (not in docs/):** AGENTS.md, CLAUDE.md, GEMINI.md - SPINE pointer files

### 1.1 RFCs

None - no non-obvious feature needs a deep design spike yet. Add a row here if one emerges.

---

## 2. Change Log

Change records against Locked documents. See engine section 7.3.

| CR ID | Date | Summary | Trigger doc | Docs touched | File |
|-------|------|---------|-------------|--------------|------|
| none | | No CRs this session - all docs are Draft | | | |

---

## 3. Traceability Matrix

Every Must-Have feature, from requirement through design to test.

| PRD-F# | Feature | Priority | In SDD | In QAD | In RFC |
|--------|---------|----------|--------|--------|--------|
| PRD-F1 | Verified submission | Must-Have | yes | N/A (tier 2; no QAD) | N/A |
| PRD-F2 | Structured incident report | Must-Have | yes | N/A (tier 2; no QAD) | N/A |
| PRD-F3 | Mandatory proof upload | Must-Have | yes | N/A (tier 2; no QAD) | N/A |
| PRD-F4 | Moderation queue | Must-Have | yes | N/A (tier 2; no QAD) | N/A |
| PRD-F5 | Right of reply | Must-Have | yes | N/A (tier 2; no QAD) | N/A |
| PRD-F6 | Aggregation view | Must-Have | yes | N/A (tier 2; no QAD) | N/A |

---

## 4. Incident Log

| PM ID | Date | Severity | Summary | Actions closed | File |
|-------|------|----------|---------|----------------|------|
| none | | | | | |

---

## 5. Health Check

- [ ] Every Locked doc reconciled date is newer than the last code change in its area
- [ ] No doc has sat in Draft past its expected movement date
- [ ] Every open change record has propagated downstream
- [ ] Every feature ID referenced by SDD still exists in the PRD
- [ ] Traceability Matrix covers every Must-Have
- [ ] Validator green (python scripts/check.py docs/)
- [ ] No secrets committed in docs/

---

## 6. Notes

- Tier 2 bootstrap from owner idea dated 2026-09-14. Stack, deployment target, and verification method are TBD(owner) - see LOG open questions.
- No code exists yet; SDD describes the target design and must stay Draft until the owner locks it.
- INVENTORY and GAP are retrofit-only artifacts and are not part of this suite.
