---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.52
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-26
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
| IDEA · Idea Brief | [idea-flag.md](idea-flag.md) | 1.0 | Locked | 2026-10-13 | 2026-10-13 |
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 2.21 | Review | 2026-10-26 | 2026-10-13 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 2.0 | Review | 2026-10-26 | 2026-10-13 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 2.13 | Review | 2026-10-26 | 2026-10-13 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 2.27 | Review | 2026-10-26 | 2026-10-13 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 2.24 | Review | 2026-10-26 | 2026-10-13 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 1.43 | Draft | 2026-10-26 | 2026-09-14 |

**Materialized at repo root (not in `docs/`):** AGENTS.md, CLAUDE.md, GEMINI.md, and IDE rule files - SPINE pointers.

### 1.1 RFCs

| RFC ID | File | Feature | Status | Updated |
|--------|------|---------|--------|---------|
| flag-rfc-001 | [rfc-flag-id-check.md](rfc-flag-id-check.md) | Government ID check without storing the ID (PRD-F1) | Draft | 2026-10-13 |

RFC flag-rfc-001 stays `Draft` on purpose: it holds the deferred PhilID QR cryptographic-check design (LOG Q13), which is unproven and out of the v1 launch scope. The pilot verifies by manual live inspection, so the launch suite locks without it. Its two remaining open owner-markers are future spike work, not launch blockers.

---

## 2. Change Log

Change records against `Locked` documents. See engine §7.3.

| CR ID | Date | Summary | Trigger doc | Docs touched | File |
|-------|------|---------|-------------|--------------|------|
| cr-001 | 2026-10-14 | Owner-approved audit repairs, retained build-guide edits, and durable authentication throttling; implementation authorized while changed docs are Review | BUILD, SDD | build-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md | [cr-001-flag-audit-fixes.md](cr-001-flag-audit-fixes.md) |
| cr-002 | 2026-10-26 | Owner-approved verification approve/reject with corrected new-request resubmission preserving history; applied, CR 0.2 Review, LOG Q25 resolved | PRD | prd-flag.md 2.0 Review, sdd-flag.md 2.12 Review, qad-flag.md 2.23 Review | [cr-002-flag-verification-decisions.md](cr-002-flag-verification-decisions.md) |

---

## 3. Traceability Matrix

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

Retired, excluded from Must-Have coverage: PRD-F5 (right of reply, Dropped; QAD H-05/S-09/AB-09 reserved) and PRD-F10 (corroboration, Dropped; QAD H-10/S-15/AB-16 reserved). IDs retained, never reused. flag-rfc-001 tracks the manual-inspection update as a deferred design reference, not a launch requirement.

### 3.1 Invariant Matrix

| INV-# | Rule | Status | Enforced in | Negative test |
|-------|------|--------|-------------|---------------|
| INV-1 | Never publish a log a moderator has not approved | Active | SDD §5.1: log queries, `decideCase` | NT-01, NT-02, NT-11 |
| INV-2 | Never accept a log without proof or without an accepted engagement | Active | SDD §5.1: `submitLog`, trigger `log_requires_proof` | NT-03, NT-04 |
| INV-3 | Never store a raw ID image or full ID number | Active | SDD section 5.1: auth user-write hooks and verification handlers | NT-05 |
| INV-4 | Never show proof outside moderators, filer, named client | Active | SDD §5.1: `/api/proofs/[id]` | NT-06 |
| INV-5 | Never compute or show an unapproved reputation signal; only the approved 1-5 rating and client average are permitted | Active | SDD §5.1: schema review, record components | NT-07, NT-12 |
| INV-6 | Never let a client edit or delete a published log | Active | SDD §5.1: server actions, `log_frozen_*` triggers | NT-08 |
| INV-7 | Never serve client records or logs to signed-out visitors or crawlers | Active | SDD §5.1: `(app)` layout, noindex, robots | NT-09 |
| INV-8 | Never let an unverified or unacknowledged freelancer open an engagement or file a log | Active | SDD §5.1: `requireVerifiedFreelancer()` | NT-10 |

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
- [x] Every feature ID referenced by SDD, RFC, or QAD still exists in the PRD
- [x] §3 Traceability Matrix covers every Must-Have
- [x] §3.1 Invariant Matrix maps every Active invariant to its designed enforcement and planned negative tests; implemented test coverage is stated separately in QAD §1
- [x] Validator green (`python $SPINE_HOME/scripts/check.py docs/`)
- [x] Latest checkpoint verifies clean (`python $SPINE_HOME/scripts/checkpoint.py verify`)
- [x] No secrets committed in `docs/`

---

## 6. Current development baseline

As of 2026-10-26, before this repair release: local dev and origin/dev are 6f23b4d, the merge of [PR #16](https://github.com/slvdrvncntjvr/FLAG/pull/16). [PR #15](https://github.com/slvdrvncntjvr/FLAG/pull/15) is also merged. The latest merged-dev [run 40277706124](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40277706124) passed verify and dependency-audit; its Cloudflare build d65d01ea passed. Exact live dev version a653efae-73b1-4ba8-ad47-bf5416b9a1c9 serves 100 percent, has the correct dev DB/auth/private PROOFS bindings, and passed all ten anonymous route/noindex checks and invalid-code throttling with stable version identity. Dev D1 has 0000-0006 applied and a clean foreign_key_check. These are observed pre-repair results, not evidence of the new repair candidate.

Owner-approved repair scope is recorded in LOG: close the standard-auth name/image privacy bypass (INV-3), accept ordinary numeric portfolio project URLs while rejecting recognizable ID payloads, preserve case-specific submitted profile/portfolio history through corrected requests, and update current copy/docs. SDD section 3.5 defines the immutable submitted_profile snapshot before migration 0007. Implementation, local gates (333 Workers, 47 Node, ten Python, twelve browser cases, both target builds/smoke/dry runs) and fresh independent review pass; QAD section 1 carries scope and corrections. Hosted checks, dev0007 and exact repaired live release remain before the authorized scoped checkpoint. No new checkpoint or repaired live release is claimed yet.

Main remains 3582f7e and production remains Worker 9b1fdc1d-c4cb-495c-a343-fb042cbaae68 at 100 percent. Production D1 has only 0000-0002 and clean FKs; the verification/profile/portfolio/engagement tables have zero rows and log tables are absent. Production must complete the pending migration sequence, recovery/preflight and release gates in OPS section 7 before a protected main merge triggers deployment. The populated-0005 failure is a conditional migration hazard, not an observed failure of this empty-feature production shape. Main's required independent developer approval and last-push approval remain unchanged.

Development uses persistent zero required human approvals on dev plus strict verify/dependency-audit checks and independent agent review. Main/production is still held. A development checkpoint does not lock or reconcile Review-state documents, clear strict/deferred warnings, or accept the complete product. All reconciled dates and eight invariants remain unchanged. Dated decisions, previous failed attempts and prior release evidence remain in LOG; use this current summary rather than historical pending-status paragraphs.

## 7. Implemented scope and remaining work

| Area | Current boundary | Evidence / next gate |
|------|------------------|----------------------|
| Accounts and onboarding (PRD-F7, PRD-F8) | Email-code authentication, acknowledgment/reacceptance, current-policy and ban/role gates; reliable mail failure/logout handling | Auth tests and browser scenarios; auth privacy repair is part of the current candidate |
| Manual verification (PRD-F1 and verification part of PRD-F4) | Request, queue/claim/inspection/approve/reject, reasoned decision, corrected new requests, ids-only audit; deployed to dev through 0006 | Snapshot/portfolio repairs require 0007 and final reviewed dev release; authenticated deployed acceptance remains separate from anonymous smoke |
| Log/proof/rating foundation (PRD-F2, PRD-F3, PRD-F14) | D1 schema and isolated private R2 configuration/storage primitives | No log submission, proof serving, publication, records or average UI yet |
| Engagement handshake (PRD-F9) | Existing design and foundation only | Consent-receipt linkage and lifecycle contract must be designed before implementation; preserved original-only F9 design is not silently adopted |
| Correction, retention and closure (PRD-F12, PRD-F13) | Approved intended behavior; no complete automation | CORRECTION_REQUEST/DATA_REQUEST, safe lifecycle schema, holds, purge/closure and log freeze/proof gates remain later work |
| Release and recovery | Exact-version dev verifier, isolated packaged smoke, CI and target guards; local/native recovery evidence | OPS section 7 retains production-specific migration/restore, backup/write-pause, cost/device and authenticated-workflow prerequisites |

Automatic QR verification remains deferred. Public replies, corroboration, paid SMS, unapproved reputation signals, payments and marketplace work remain excluded.
