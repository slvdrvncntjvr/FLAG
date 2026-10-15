---
spine_type: INDEX
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.19
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-15
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
| BUILD · Build Guide | [build-flag.md](build-flag.md) | 2.3 | Review | 2026-10-15 | 2026-10-13 |
| PRD · Product Requirements | [prd-flag.md](prd-flag.md) | 1.0 | Locked | 2026-10-13 | 2026-10-13 |
| SDD · System Design | [sdd-flag.md](sdd-flag.md) | 2.2 | Review | 2026-10-15 | 2026-10-13 |
| QAD · QA & Test Plan | [qad-flag.md](qad-flag.md) | 2.4 | Review | 2026-10-15 | 2026-10-13 |
| OPS · Ops & Observability | [ops-flag.md](ops-flag.md) | 2.3 | Review | 2026-10-15 | 2026-10-13 |
| LOG · Session Log | [log-flag.md](log-flag.md) | 1.9 | Draft | 2026-10-15 | 2026-09-14 |

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
| INV-3 | Never store a raw ID image or full ID number | Active | SDD §5.1: verification case handler | NT-05 |
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

- [x] Every `Locked` doc's `reconciled` date is newer than the last code change in its area
- [ ] No doc has sat in `Draft` past its expected movement date
- [x] Every open change record has propagated downstream
- [x] Every feature ID referenced by SDD, RFC, or QAD still exists in the PRD
- [x] §3 Traceability Matrix covers every Must-Have
- [x] §3.1 Invariant Matrix maps every Active invariant to its designed enforcement and planned negative tests; implemented test coverage is stated separately in QAD §1
- [x] Validator green (`python $SPINE_HOME/scripts/check.py docs/`)
- [x] Latest checkpoint verifies clean (`python $SPINE_HOME/scripts/checkpoint.py verify`)
- [x] No secrets committed in `docs/`

---

## 6. Notes

- 2026-10-15 PR review readiness: temporary HANDOFF.md deleted; upstream dev is unchanged at 10db33d. Remote inspection reports R2 is disabled (10042), so configured buckets cannot yet be provisioned, and dev migration 0004 is pending. PR may be pushed for review; merge into auto-deploying dev stays on hold until storage/release prerequisites are ready.

- 2026-10-15 issue #5 local implementation complete: four log/proof tables and migration 0004_clever_arclight, separate private-bucket configs, R2 test binding, and deployment resource checks. All 69 Workers tests, nine Node deployment tests, lint, app/test typechecks, and the full dev Worker build pass; fresh local migrations and snapshot preservation verified. Remote buckets/privacy, migration, and release remain pending; product workflow boundary remains auth/onboarding.

- 2026-10-15: issue #5 implementation authorized against the existing Review-state design (LOG). Branch f5-log-proof-schema starts from dev/origin/dev at 10db33d. Scope is the PRD-F2/PRD-F3 database and storage foundation; later workflow issues and remote release operations are separate.

- 2026-10-14 latest release status: owner authorized and completed migration 0003 to flag-db-dev and manual deployment to flag-dev, version bd7b2957-e125-4dfe-a4ea-41c139510ca6. Active dev DB/auth bindings and seven routes passed live checks, including policy versions and the OTP limit. Production release and dashboard CI-setting corrections remain pending. The owner subsequently requested committing/pushing to dev; six deployment tests and actual negative/positive CI dry runs passed before that push.

- 2026-10-14 current status: owner-approved cr-001 local repairs complete: atomic onboarding, durable D1 auth limits, missing-mail checks, privacy/terms versions 2026-10-14, guarded environment-specific deployment scripts, compatible security updates, and local fonts. All 21 tests, lint, typechecks, and full OpenNext build pass; fresh local migrations pass; checkpoint verification is clean. Remote migration/deployment and dashboard settings remain pending. Auth/onboarding is the implemented workflow boundary; supporting verification and engagement tables exist but their workflows remain planned. QAD case IDs and the invariant matrix describe the target test plan. Superseded historical notes below remain history.

- 2026-10-12 overhaul on branch `foverhaul`: tier raised from 2 to 3; product reshaped around the engagement handshake, eight owner-confirmed invariants, and the course SMART goals in `group_context/`. Feature IDs PRD-F1 to PRD-F6 keep their meaning; PRD-F7 to PRD-F13 are new.
- 2026-10-12: PRD-F7 and PRD-F8 built on `foverhaul` against Draft docs with owner authorization (LOG); 13 Vitest cases pass in the Workers pool. Verification status (PRD-F1) does not exist yet, so `requireVerifiedFreelancer()` refuses everyone.
- `prototype/` (the retired static mock, never described by any doc) was deleted on 2026-10-14; the app lives solely in `web/`.
- `reconciled` dates on carried-over docs stay at 2026-09-14 until the owner confirms them; the agent does not advance them.
- 2026-10-13 owner-confirmed decisions (LOG §1, ten rows): (1) keep accepted-engagement requirement, refusal out of scope with no negative signals; (2) no PUBLIC replies, keep private "Request a review of this post"; (3) simple 1-5 client rating, no leaderboards/rankings, aggregate mechanics and threshold UNDECIDED; (4) mandatory proof plus human review for positive and negative alike; (5) verification means identity checked, never guaranteed trustworthiness, method/fallback unsettled; (6) role access as built (freelancers browse, clients own record, staff review; proofs filer/named client/moderators); (7) independently submitted reviewed experiences instead of corroboration clicks in v1, coursework imposes no features; (8) approve/ask-changes/reject with reasons and history, private correction can withdraw unsupported publication, client cannot edit/delete; (9) owner wants a specific retention proposal, durations UNDECIDED; (10) both positive and negative experiences, no positivity quota. Seven new open questions LOG Q16-Q22 carry exact proposed rules labelled proposals, not approvals.
- These 2026-10-13 decisions superseded prior choices in principle (notably INV-5/PRD-F6/PRD-F10/M7/M6 as written); the full suite has since been propagated and the current docs govern: IDEA 0.4, PRD 0.4, SDD 0.3, QAD 0.2, BUILD 0.3, OPS 0.2, RFC 001 0.2. No contract, schema, legal-copy, or code changes follow without owner direction; all docs stay Draft with no lock and no reconciled advance.
- Clarification 2026-10-13: the logged role-access decision (item 6) is an OWNER-APPROVED TARGET, not as-built behavior. All suite docs are Draft, so revising those Draft contracts to reflect owner answers requires no change record and no extra approval process — CRs govern Locked docs only.
- LOG §2 carries a COORDINATOR PROPOSAL REVISION note (2026-10-13) correcting the Q16-Q22 proposal wording (contributor-based threshold, filing timing, identity, fallback, correction, alias, retention, optional star-derived outcomes). Coordinator recommendations only; nothing there is approved.
- 2026-10-13 latest owner approvals (LOG §1 eight rows; §3 six resolved rows Q16/Q18/Q19/Q20/Q21/Q22; §2 Q16-Q22 proposal rows preserved untouched and §3 rows are latest status): CLIENT average is mean of latest approved rating per distinct freelancer/client, visible from first approval with contributor count, Limited record under five contributors; outcome scale 1-2 Negative / 3 Mixed / 4-5 Positive with factual tags kept, star timing and first-eligible-vs-chosen-event anchor remain proposal NOT approved; eligibility after accepted relationship plus completion/termination OR missed agreed payment/milestone with 15-DAY filing deadline approved but anchor/details open as new Q23; match by client account plus moderator verification, never auto-merge names; manual live ID inspection plus portfolio, no saved ID copies/full numbers, no PAID SMS, automatic scan deferred until proven and NOT prohibited/out of scope forever; readers see freelancer NAME superseding alias, no contact/ID visible, exact name form undecided with account professional name verified by moderator as proposal only; correction anytime record exists, one open request, new evidence for followups, independent moderator target 48h, request alone does not hide, real privacy/error may temporarily hide, approve/ask-changes/reject as logged; retention as logged with rolling 12-month empty-record direction (proposed copy: No published experiences in the past 12 months). Q17 remains partly resolved (duration approved, anchor open as Q23); record-naming exact form remains minor recommendation, not definite legal name. No INV defined/changed until downstream propagation; no CR required — all suite docs Draft.
- 2026-10-13 stage-1 alignment (LOG §1 three rows; §3 four rows Q23/Q17/Q12/Q13): IDEA 0.3 and PRD 0.3 rewritten to the approved contract — awareness-only accepted-engagement scope with refusal out of scope and no signal; no public replies, corroboration clicks, unapproved ranks/leaderboards/endorsements, marketplace, payments, or dispute work; every experience needs proof plus human approval; 1-5 per-log rating with automatic Negative/Mixed/Positive and factual tags; client average as mean of latest eligible approved published rating per distinct pair from the first contributor with count and Limited record under five; 15-calendar-day filing clock anchored at completion/termination or first missed agreed payment/milestone date (submission on time; 1 April to 16 April; no extensions); private correction anytime with one open request, new-evidence repeats, independent 48h-target review, hide only for credible error/privacy risk, uphold/ask-changes/correct/withdraw with history plus moderated filer updates; manual live ID inspection (PhilID/ePhilID, passport, driver licence) plus portfolio with no stored copies, identity-checked wording, no paid SMS, QR deferred until proven; filer names shown to signed-in readers with contact/ID private; client matched by account with moderator evidence checks and no auto-merge; 12-month original-publication retention with 30-day drafts/rejected handling, 12-month consent/moderation history, holds, and 30-day close assessment. PRD-F5 and PRD-F10 Retired/Dropped (IDs retained); PRD-F13 Must-Have private correction; new PRD-F14 Must-Have ratings; PRD-F12 Must-Have retention; FLAG-M4/M7 Retired; FLAG-M6 descriptive; new FLAG-M10/M11/M12. Changed-feature SDD/QAD trace pending stage 3. Latest owner yep-lets-align accepts the filing anchor; Q17/Q23 fully resolved; Q12 needs no provider; Q13 deferred. All docs stay Draft; reconciled never advanced; no CR required.
- 2026-10-13 final alignment complete (LOG §1 completion row; §3 latest-status rows): QAD 0.2 covers all Must-Haves with H/S/AB plus NT-01–NT-12; F5/F10 retired with old case IDs reserved; metrics M4/M7 retired and M6 descriptive with M10–M12 verified in §5.2. Q9 resolved by the approved qualitative proof rubric; Q7 caps and Q14 module owners stay Open; Q13 QR work deferred. As-built boundary holds at auth/onboarding only. Historical proposals and superseded wording remain in LOG; current docs govern.
- Build order mapped to the course weeks: Week 1-2 PRD-F7, PRD-F8; Week 3-4 PRD-F1, PRD-F9; Week 4-5 PRD-F2, PRD-F3; Week 5-6 PRD-F4, PRD-F13, PRD-F6, PRD-F14; Week 7-8 pilot.
- 2026-10-13 five-issue fix pass (LOG §1 completion row): PRD 0.5, SDD 0.4, QAD 0.3, OPS 0.3 — covered work period plus optional amount in centavos on LOG_REVISION with CHECKs; average-fallback wording aligned across PRD/SDD/QAD with no behavior change; withdrawn/abandoned-ask-changes/abandoned-update retention mapped from approved periods only; closure semantics with FK RESTRICT plus stub row and the as-built cascade marked needs-future-migration (docs only, no code change); expired-records wording fixed. All docs stay Draft; reconciled never advanced; no CR required.
