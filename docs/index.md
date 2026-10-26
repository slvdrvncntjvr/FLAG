---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.56
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-27
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
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 2.24 | Review | 2026-10-26 | 2026-10-13 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 2.0 | Review | 2026-10-26 | 2026-10-13 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 2.14 | Review | 2026-10-26 | 2026-10-13 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 2.31 | Review | 2026-10-27 | 2026-10-13 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 2.28 | Review | 2026-10-27 | 2026-10-13 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 1.47 | Draft | 2026-10-27 | 2026-09-14 |

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

Verified application release, observed 2026-10-26 at 07:52 UTC: [PR #17](https://github.com/slvdrvncntjvr/FLAG/pull/17) merged reviewed source cdcdc50 into dev as 45540d8d6c2be8a89d492cba38ec464d7ea62ed7. Required hosted jobs passed on the [PR head](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40287087925) and [merged dev](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40287906609). Cloudflare build ad814386-4966-46f7-8a27-16976a5317ba explicitly maps that merged commit to Worker 1e1c2440-1ce1-484b-abee-e7c3558000a1. Exact-version verification passed at 100 percent with correct dev DB/auth/private PROOFS bindings, all ten anonymous route/noindex checks, matching displayed 2026-10-26 policy titles/versions, invalid-code statuses 400/400/400/400/400/429 and stable identity. No mail, signup or real inspection was performed.

The three reproduced defects are repaired: standard-auth user hooks reject recognizable sensitive names/raw images and discard HTTP image values; ordinary numeric project URLs work with bounded component/payload checks; new cases retain immutable name/city/portfolio snapshots through rejection and corrected resubmission. Legacy original inputs remain explicitly unavailable. Privacy/terms versions are 2026-10-26 and require reacknowledgment; freelancer/client-consent versions are unchanged. Full scoped local evidence is 333 Workers, 47 Node, ten Python and twelve desktop/360px cases, types/lint, both zero-finding audits, both target builds/guards/dry runs and packaged smoke; fresh independent reviews find no remaining blocker. QAD section 1 states evidence scope and the minor follow-ups.

Dev migration 0007 completed before merge after fresh preflight and a captured recovery bookmark. Original row-value hashes and prior schema objects were preserved; 0000-0007 are applied, fourteen triggers are installed, no historical snapshots were fabricated and foreign keys are clean. The owner-approved local annotated checkpoint spine-cp-2026-10-26-1 captures the integrated application at 45540d8. Normal SPINE 0.3.0 validation passes with four known warnings and checkpoint verification is CLEAN. The tag remains local. Strict validation, document lock/human reconciliation, complete-product and production acceptance are not claimed; all reconciled dates and eight invariants remain unchanged.

The earlier PR18 documentation follow-up recorded that dev release/checkpoint without application, schema, dependency or policy source changes. Subsequent production SQL evidence appears below. Documentation publication can trigger a same-code dev build, whose resulting exact-version check belongs on its publishing PR. The dev UUID above is a dated observation; LOG preserves dated decisions, failures and release evidence.

Main remains3582f7e and production remains Worker9b1fdc1d-c4cb-495c-a343-fb042cbaae68 at100percent. Production SQL now has0000-0007 after the owner-approved2026-10-26 operation: eight ledger rows, fourteen permanent triggers, all original auth/ledger values preserved, clean FKs, exact no-op reapplication and no remaining temporary pause guards. The single write pause lasted7minutes36.393seconds, including the safely stopped0004 wire-format comparison and reviewed continuation; original source files and active Worker were preserved. OPS section7/QAD section1 record remote recovery, fresh paused encrypted backup, exact per-stage and live postflight evidence. The conditional populated0005 hazard remains documented for future nonempty targets. Main's developer/last-push approvals and remaining application-release gates stay in force; dev's zero required human approvals retains strict CI and independent agent review.

Production verification includes the real local D1 rehearsal, seventeen Python tests, independently reviewed isolated remote backup import/Time Travel restore, and synthetic private R2 recovery. LOG Q26 records explicit approval of the temporary production-backup destination; the selected encrypted directory and thirty-minute zero-planned-loss pause remain the governing decisions. QAD section1/OPS section7 bind the current source/receipt evidence and its limits.

## 7. Implemented scope and remaining work

Next owner-directed step,2026-10-27: publish the reviewed recovery tooling/evidence to dev and prepare a protected draft application-promotion PR. Fresh local production build/guard/no-upload package/ten-route isolated smoke, seventeen Python cases and both zero-finding dependency audits pass. OPS section7/QAD section1 retain evidence boundaries and the remaining developer, device/Messenger, inbox, authenticated inspection and budget-alert gates. No production application release follows from local packaging success.

| Area | Current boundary | Evidence / next gate |
|------|------------------|----------------------|
| Accounts and onboarding (PRD-F7, PRD-F8) | Email-code authentication, acknowledgment/reacceptance, current-policy and ban/role gates; reliable mail failure/logout handling | Auth privacy regressions and browser scenarios pass locally and in hosted CI |
| Manual verification (PRD-F1 and verification part of PRD-F4) | Request, queue/claim/inspection/approve/reject, reasoned decision, corrected new requests, ids-only audit; deployed to dev through 0007 | Snapshot/portfolio repairs are released in PR17/0007; authenticated real-inspection acceptance remains separate from anonymous smoke |
| Log/proof/rating foundation (PRD-F2, PRD-F3, PRD-F14) | D1 schema and isolated private R2 configuration/storage primitives | No log submission, proof serving, publication, records or average UI yet |
| Engagement handshake (PRD-F9) | Existing design and foundation only | Consent-receipt linkage and lifecycle contract must be designed before implementation; preserved original-only F9 design is not silently adopted |
| Correction, retention and closure (PRD-F12, PRD-F13) | Approved intended behavior; no complete automation | CORRECTION_REQUEST/DATA_REQUEST, safe lifecycle schema, holds, purge/closure and log freeze/proof gates remain later work |
| Release and recovery | Dev release controls, local D1 rehearsal, isolated remote D1/synthetic R2 recovery and verified production SQL through0007 | OPS section7 records fresh paused backup, preserved data and safe reopen; application promotion, cost/device and authenticated workflow gates remain separate |

Automatic QR verification remains deferred. Public replies, corroboration, paid SMS, unapproved reputation signals, payments and marketplace work remain excluded.

Latest completed operation,2026-10-26: production SQL0003-0007 is applied and independently checked. The fresh paused encrypted backup and retained recovery bookmark pass exact comparison; all original auth data survives, all fifteen pause guards are removed, schema/ledger/FKs/no-op and seven anonymous live checks pass, and the unchanged Worker remains at100percent. The final receipt binds source70360436 and SHA58ffadc4; original interrupted evidence remains in LOG/local receipts. Main/code promotion, authenticated workflows, device/budget-alert acceptance, checkpoints and human reconciliation remain separate.
