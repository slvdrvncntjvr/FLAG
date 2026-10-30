---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.76
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
| IDEA · Idea Brief | [idea-flag.md](idea-flag.md) | 2.0 | Review | 2026-10-30 | 2026-10-13 |
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 2.35 | Review | 2026-10-30 | 2026-10-13 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 2.0 | Review | 2026-10-26 | 2026-10-13 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 2.23 | Review | 2026-10-30 | 2026-10-13 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 2.45 | Review | 2026-10-30 | 2026-10-13 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 2.36 | Review | 2026-10-30 | 2026-10-13 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 1.66 | Draft | 2026-10-30 | 2026-09-14 |

**Materialized at repo root (not in `docs/`):** AGENTS.md, CLAUDE.md, GEMINI.md, and IDE rule files - SPINE pointers.

### 1.1 RFCs

| RFC ID | File | Feature | Status | Updated |
|--------|------|---------|--------|---------|
| flag-rfc-001 | [rfc-flag-id-check.md](rfc-flag-id-check.md) | Government ID check without storing the ID (PRD-F1) | Draft | 2026-10-13 |

RFC flag-rfc-001 stays `Draft` on purpose: it holds the deferred PhilID QR cryptographic-check design (LOG Q13), which is unproven and out of the v1 launch scope. The pilot verifies by manual live inspection. Its two open owner-markers are future spike work, not launch blockers.

---

## 2. Change Log

Change records against `Locked` documents. See engine §7.3.

| CR ID | Date | Summary | Trigger doc | Docs touched | File |
|-------|------|---------|-------------|--------------|------|
| cr-001 | 2026-10-14 | Owner-approved audit repairs, retained build-guide edits, and durable authentication throttling; implementation authorized while changed docs are Review | BUILD, SDD | build-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md | [cr-001-flag-audit-fixes.md](cr-001-flag-audit-fixes.md) |
| cr-002 | 2026-10-26 | Owner-approved verification approve/reject with corrected new-request resubmission preserving history; applied, CR 0.2 Review, LOG Q25 resolved | PRD | prd-flag.md 2.0 Review, sdd-flag.md 2.12 Review, qad-flag.md 2.23 Review | [cr-002-flag-verification-decisions.md](cr-002-flag-verification-decisions.md) |
| cr-003 | 2026-10-30 | Owner-approved wording fixes: remove the stale as-built sentence from IDEA §6 and correct the Q7 cap wording to match the approved weekly log quota; no scope or invariant change | IDEA | idea-flag.md 2.0 Review, build-flag.md, index.md, log-flag.md | [cr-003-flag-idea-status-cleanup.md](cr-003-flag-idea-status-cleanup.md) |

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

Retired, excluded from Must-Have coverage: PRD-F5 (right of reply, Dropped; QAD H-05/S-09/AB-09 reserved) and PRD-F10 (corroboration, Dropped; QAD H-10/S-15/AB-16 reserved). IDs retained, never reused. flag-rfc-001 is a deferred design reference, not a launch requirement.

### 3.1 Invariant Matrix

| INV-# | Rule | Status | Enforced in | Negative test |
|-------|------|--------|-------------|---------------|
| INV-1 | Never publish a log a moderator has not approved | Active | SDD §5.1: log queries, moderation decision action `decideReview` (log-kind handler planned) | NT-01, NT-02, NT-11 |
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
- [x] Validator green in normal mode (`python scripts/spine.py check docs/`)
- [x] Latest checkpoint verifies clean (`python scripts/spine.py checkpoint verify`)
- [x] No secrets committed in `docs/`

---

## 6. Current development baseline

This section is the only current-status map. Other docs describe design and procedures, not status. Dated history is in LOG and git.

| Where | What it runs | Schema |
|-------|--------------|--------|
| Dev (`flag-dev`, branch `dev`) | PR22 merge `0bd505f`: sign-in, onboarding, manual verification with moderator review, consent-first engagement invites | Migrations 0000–0008 |
| Production (`flag`, branch `main`) | Older app at `3582f7e`: sign-in and onboarding only. It predates the PROOFS binding | Migrations 0000–0007 |
| Branch `f2-private-log-proof-intake` (not pushed) | Private log drafts, proof upload and submission to pending (PRD-F2, PRD-F3, per-log PRD-F14). Off by default: `PRIVATE_INTAKE_ENABLED` is `"false"` for dev and production in `web/wrangler.jsonc` | Adds migration 0009, applied nowhere remote |

Dev legal versions: privacy and terms `2026-10-27`; freelancer acknowledgment and per-engagement client consent `2026-10-12` (`web/src/lib/policies.ts`).

What a user can do on dev today: sign in, accept the policies, request verification, have a moderator verify them, invite a client, and have the client accept or decline. A logged experience cannot be published or read by other freelancers yet.

Moderator and admin roles have no admin screen. The owner sets them directly in the D1 `user.role` column.

## 7. Implemented scope and remaining work

The owner prioritizes Must-Haves before optional PRD-F11 notifications (LOG 2026-10-30). This list is a backlog, not an authorization to implement or release.

| Order | Work | Requirement |
|-------|------|-------------|
| 1 | Enable private log intake on dev: back up dev D1, apply 0009, update privacy/terms to describe logs and proofs, set the flag on dev, owner checks on Android Chrome and desktop ([OPS §5](ops-flag.md#5-runbooks)) | PRD-F2, PRD-F3, PRD-F8 |
| 2 | Log moderation: list log cases, claim, approve / ask-changes / reject with a reason, publish on approval. Needs a migration 0010, because the 0009 triggers only allow the draft-to-pending path | PRD-F4, INV-1 |
| 3 | Client search and client record page: average with contributor count, Limited-record label under five, outcome counts, tags, published logs | PRD-F6, PRD-F14 |
| 4 | Pilot-scope decision, open (LOG Q28): whether data requests and account closure, the retention job, and corrections/filer updates are built before the first publication or handled manually during the pilot | PRD-F12, PRD-F13 |
| 5 | Production promotion when the owner decides ([OPS §7](ops-flag.md#7-production-readiness-gate)) | — |

Release checks are green CI plus the manual smoke check ([QAD §1](qad-flag.md#1-strategy)). Owner acceptance is recorded in the [QAD §7.1 worksheet](qad-flag.md#71-owner-manual-acceptance-worksheet-prepared-2026-10-27). On 2026-10-30 the owner dropped billing-tier proofs, exact release-identity checks, production recovery drills, purge-owner recovery gates, iPhone/Messenger device gates and extra main-approval gates (LOG §1).

CORRECTION_REQUEST and DATA_REQUEST are designed, not built; lifecycle fields need design before migration. Deferred: PRD-F11 notifications, QR automation (RFC 001) and the undecided PRD §6 candidates, including the Messenger helper (LOG Q27). Public replies, corroboration, refusal signals, unapproved reputation signals, marketplace and payment work, and paid upgrades stay outside the approved scope.
