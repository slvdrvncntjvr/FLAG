---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.75
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-30
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
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 2.34 | Review | 2026-10-30 | 2026-10-13 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 2.0 | Review | 2026-10-26 | 2026-10-13 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 2.22 | Review | 2026-10-30 | 2026-10-13 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 2.44 | Review | 2026-10-30 | 2026-10-13 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 2.35 | Review | 2026-10-30 | 2026-10-13 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 1.65 | Draft | 2026-10-30 | 2026-09-14 |

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

**Current task, 2026-10-30: scope audit and documentation cleanup only.** This section is the single current-status map. Earlier implementation sequences in LOG are dated decisions; they do not start another milestone under this cleanup request. Locked IDEA and PRD meaning remain unchanged: awareness-only, consented engagements, private proof, human approval before publication, and only the approved ratings. All eight invariants remain active.

### Recorded deployed baseline

These are retained observations, not fresh live checks by this documentation cleanup. PR22 released the invitation-target repair; the older unresolved cross-tab blocker is historical.

| Environment | Recorded source / Worker | Schema and evidence boundary |
|-------------|--------------------------|------------------------------|
| Dev | PR22, `0bd505f39bc89d81eb84cf3b858dfd3a9987a045`; build `abd9d773-b596-4248-86a6-9da46bd63d33` maps to Worker `6728c128-9860-4783-9235-b56ec61176c1` | 2026-10-30 metadata at 09:44 UTC records 100 percent traffic; separate SELECT-only ledger receipts confirm 0000–0008. Auth/onboarding, manual verification/shared verification review and consent-first engagements are released |
| Production | Main `3582f7e31c0d1caf3c22d71adcd8a7f9756e80d1`; Worker `9b1fdc1d-c4cb-495c-a343-fb042cbaae68` | Same metadata observation records unchanged 100 percent traffic; ledger receipts confirm 0000–0007. The older application lacks PROOFS and fails that current verifier gate before route probes |

GitHub observations at 10:35 UTC still report those dev/main heads and blocked draft production PR20. Dev privacy/terms are `2026-10-27`; freelancer acknowledgment and per-engagement client consent remain `2026-10-12` (`web/src/lib/policies.ts:8`). Every later release needs its own source/build/version mapping and fresh target checks.

### Local candidate, separate from deployed scope

Private draft/proof intake and additive 0009 remain local and unpublished, ending at **pending** (PRD-F2, PRD-F3, per-log PRD-F14). Checked-in dev/production settings are false (`web/wrangler.jsonc:34`, `:63`); only exact server-owned `true` enables intake (`web/src/features/logs/rollout.ts:6`). Existing relationship-authorized private reads remain available while mutations are disabled (`web/src/features/logs/actions.ts:18`, `web/src/app/api/logs/[id]/proofs/route.ts:7`, `web/src/app/api/proofs/[id]/route.ts:6`).

[QAD §1](qad-flag.md#1-strategy) holds the dated local receipts: 608 Workers tests, 18 desktop/mobile browser cases, quality/build/no-upload package checks, independent privacy/rollout reviews, and 28 authenticated packaged-workerd checks against actual 0008 with disabled intake and unchanged DB/R2 snapshots. Earlier failed attempts remain recorded. These checks support disabled source review; they do not establish hosted candidate CI, a deployed intake release, packaged Server Action acceptance, real material, genuine ID inspection or physical-device acceptance.

## 7. Implemented scope and remaining work

The owner prioritizes existing Must-Haves before optional PRD-F11 notifications. This is a backlog and gate map, not automatic implementation or publication authorization.

| Boundary | Still required |
|----------|----------------|
| Disabled source review / any later dev release | Source-only feature review can proceed without remote 0009 or activation prerequisites. No commit, push, PR or merge was performed in this cleanup. An auto-deploying dev merge still needs the concrete release decision, current-head hosted verify/dependency-audit, independent review and exact mapped live-version/binding checks |
| Before accepting real intake | Reliable independent draft/orphan cleanup, bounded retries and recovery or quarantine of unproven purge owners; verified actual account tier/shared headroom and effective pre-cap warning/stop behavior; reviewed target-specific 0009 preservation/recovery; applicable notice/reacceptance review; authenticated runtime and changed-candidate human/device acceptance. [OPS §5](ops-flag.md#5-runbooks) retains operational details. The USD10 alert is not a free-tier cutoff; the control design remains unresolved, not authority to build a new budget platform |
| Before first real publication | Remaining log moderation/immutable review, private corrections/filer updates, assessed data requests/account closure, visibility expiry, finite holds and full retention (PRD-F4, PRD-F12, PRD-F13). The local draft cleaner is not complete lifecycle enforcement |
| Complete product / production | Client records/search and eligible contributor averages (PRD-F6, aggregate PRD-F14), integrated Must-Have/invariant tests, [human acceptance worksheet](qad-flag.md#71-owner-manual-acceptance-worksheet-prepared-2026-10-27), operational acceptance, separate production signal, main's independent developer/last-push approval, current CI and exact production target/version/policy/PROOFS checks ([OPS §7](ops-flag.md#7-production-readiness-gate)) |

CORRECTION_REQUEST and DATA_REQUEST are designed, not built; lifecycle fields require design before migration. Optional notifications, QR automation and undecided PRD §6 candidates are deferred. The Messenger helper banner is an unresolved candidate (LOG Q27), not an adopted Must-Have. Public replies, corroboration, refusal signals, unapproved reputation signals, marketplace/payment work and paid pilot upgrades remain outside the approved boundary.

### Dated evidence references

- **2026-10-30:** [QAD §1](qad-flag.md#1-strategy) and [LOG decisions](log-flag.md#1-decisions) retain private-intake authorization, privacy/hold/purge repairs, browser failures and final passes, package/source hashes, disabled rollout and authenticated 0008 results. [OPS §5](ops-flag.md#5-runbooks) retains account/bucket observations and their limits.
- **2026-10-28 / PR22:** [QAD §1](qad-flag.md#1-strategy) retains the AB-35 invitation-target repair, 46 focused tests, guard-removal necessity probe and desktop/360px regression; LOG retains the subsequent PR22 merge/build/exact-dev receipt. The earlier PR21 blocker is superseded by that repair.
- **2026-10-27 / PR21:** [QAD §1](qad-flag.md#1-strategy), [OPS historical receipt](ops-flag.md) and LOG retain notice/reacceptance, dev 0008 preservation/no-op (9 ledger rows, 21 triggers), hosted CI, mapped dev release and the distinct owner-reported acceptance limits. [PR21](https://github.com/slvdrvncntjvr/FLAG/pull/21) retains the publishing receipt.
- **2026-10-26 / PR17 and checkpoint:** [QAD §1](qad-flag.md#1-strategy), [OPS §7](ops-flag.md#7-production-readiness-gate) and LOG retain profile/privacy/snapshot repairs, local/hosted/browser evidence, dev 0007 preservation and exact release, and owner-approved local `spine-cp-2026-10-26-1` at `45540d8`. [PR17](https://github.com/slvdrvncntjvr/FLAG/pull/17) retains the publishing receipt.
- **2026-10-26 production SQL/recovery:** [OPS §7](ops-flag.md#completed-recovery-and-production-sql-2026-10-26), [QAD §1](qad-flag.md#1-strategy), LOG Q26 and [recoveries](log-flag.md#5-recoveries) retain the stopped wire-format comparison, approved continuation, 7m36.393s pause, exact original-data/schema preservation, 8 ledger rows/14 permanent triggers, no-op/clean FKs/no remaining pause guards, encrypted backup/bookmark and isolated D1/synthetic R2 recovery. Application promotion was separate.

Normal pinned SPINE validation and checkpoint verification are local documentation checks; strict validation, document lock and human reconciliation remain open. This cleanup advances no status, reconciled date, checkpoint, release or acceptance gate.
