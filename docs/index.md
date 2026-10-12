---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.2
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-12
reconciled: 2026-09-14
---

# Documentation Index: FLAG

**Project slug:** `flag`
**Tier:** 3 - Product
**Maintained by:** slvdrvncntjvr

Built on SPINE 0.3.0

---

## 1. Document Suite

| Document | File | Version | Status | Updated | Reconciled |
|----------|------|---------|--------|---------|------------|
| IDEA · Idea Brief | [idea-flag.md](idea-flag.md) | 0.2 | Draft | 2026-10-12 | 2026-09-14 |
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 0.2 | Draft | 2026-10-12 | 2026-09-14 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 0.2 | Draft | 2026-10-12 | 2026-09-14 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 0.2 | Draft | 2026-10-12 | 2026-09-14 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 0.1 | Draft | 2026-10-12 | 2026-10-12 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 0.1 | Draft | 2026-10-12 | 2026-10-12 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 0.2 | Draft | 2026-10-12 | 2026-09-14 |

**Materialized at repo root (not in `docs/`):** AGENTS.md, CLAUDE.md, GEMINI.md, and IDE rule files - SPINE pointers.

### 1.1 RFCs

| RFC ID | File | Feature | Status | Updated |
|--------|------|---------|--------|---------|
| flag-rfc-001 | [rfc-flag-id-check.md](rfc-flag-id-check.md) | Government ID check without storing the ID (PRD-F1) | Draft | 2026-10-12 |

---

## 2. Change Log

Change records against `Locked` documents. See engine §7.3.

| CR ID | Date | Summary | Trigger doc | Docs touched | File |
|-------|------|---------|-------------|--------------|------|
| none | | No CRs; every doc is Draft | | | |

---

## 3. Traceability Matrix

| PRD-F# | Feature | Priority | In SDD | In QAD | In RFC |
|--------|---------|----------|--------|--------|--------|
| PRD-F1 | Freelancer verification | Must-Have | yes | yes | flag-rfc-001 |
| PRD-F2 | Structured engagement log | Must-Have | yes | yes | N/A |
| PRD-F3 | Mandatory proof upload | Must-Have | yes | yes | N/A |
| PRD-F4 | Moderation queue | Must-Have | yes | yes | N/A |
| PRD-F5 | Right of reply | Must-Have | yes | yes | N/A |
| PRD-F6 | Client record | Must-Have | yes | yes | N/A |
| PRD-F7 | Accounts and sign-in | Must-Have | yes | yes | N/A |
| PRD-F8 | Onboarding and legal acknowledgment | Must-Have | yes | yes | N/A |
| PRD-F9 | Client registration and engagement handshake | Must-Have | yes | yes | N/A |
| PRD-F10 | Corroboration | Must-Have | yes | yes | N/A |

### 3.1 Invariant Matrix

| INV-# | Rule | Status | Enforced in | Negative test |
|-------|------|--------|-------------|---------------|
| INV-1 | Never publish a log a moderator has not approved | Active | SDD §5.1: log queries, `decideCase` | NT-01, NT-02 |
| INV-2 | Never accept a log without proof or without an accepted engagement | Active | SDD §5.1: `submitLog`, trigger `log_requires_proof` | NT-03, NT-04 |
| INV-3 | Never store a raw ID image or full ID number | Active | SDD §5.1, RFC 001: ID check handler | NT-05 |
| INV-4 | Never show proof outside moderators, filer, named client | Active | SDD §5.1: `/api/proofs/[id]` | NT-06 |
| INV-5 | Never compute or show a score, rating, rank, or leaderboard | Active | SDD §5.1: schema review, record components | NT-07 |
| INV-6 | Never let a client edit or delete a published log | Active | SDD §5.1: server actions, `log_frozen_*` triggers | NT-08 |
| INV-7 | Never serve client records or logs to signed-out visitors or crawlers | Active | SDD §5.1: `(app)` layout, noindex, robots | NT-09 |
| INV-8 | Never let an unverified or unacknowledged freelancer file or corroborate | Active | SDD §5.1: `requireVerifiedFreelancer()` | NT-10 |

---

## 4. Incident Log

| PM ID | Date | Severity | Summary | Actions closed | File |
|-------|------|----------|---------|----------------|------|
| none | | | | | |

---

## 5. Health Check

- [ ] Every `Locked` doc's `reconciled` date is newer than the last code change in its area
- [ ] No doc has sat in `Draft` past its expected movement date
- [ ] Every open change record has propagated downstream
- [ ] Every feature ID referenced by SDD, RFC, or QAD still exists in the PRD
- [ ] §3 Traceability Matrix covers every Must-Have
- [ ] §3.1 Invariant Matrix: every `Active` invariant is enforced and has a negative test
- [ ] Validator green (`python $SPINE_HOME/scripts/check.py docs/`)
- [ ] Latest checkpoint verifies clean (`python $SPINE_HOME/scripts/checkpoint.py verify`)
- [ ] No secrets committed in `docs/`

---

## 6. Notes

- 2026-10-12 overhaul on branch `foverhaul`: tier raised from 2 to 3; product reshaped around the engagement handshake, eight owner-confirmed invariants, and the course SMART goals in `group_context/`. Feature IDs PRD-F1 to PRD-F6 keep their meaning; PRD-F7 to PRD-F13 are new.
- 2026-10-12: PRD-F7 and PRD-F8 built on `foverhaul` against Draft docs with owner authorization (LOG); 13 Vitest cases pass in the Workers pool. Verification status (PRD-F1) does not exist yet, so `requireVerifiedFreelancer()` refuses everyone.
- `prototype/` is the retired static mock; it is not described by any doc and will be deleted once `web/` reaches parity.
- `reconciled` dates on carried-over docs stay at 2026-09-14 until the owner confirms them; the agent does not advance them.
- Build order mapped to the course weeks: Week 1-2 PRD-F7, PRD-F8; Week 3-4 PRD-F1, PRD-F9; Week 4-5 PRD-F2, PRD-F3; Week 5-6 PRD-F4, PRD-F5, PRD-F6, PRD-F10; Week 7-8 pilot.
