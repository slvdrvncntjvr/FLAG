---
spine_type: PRD
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

# Product Requirements: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)

---

## 1. Scope statement

FLAG v1 covers verified freelancer submission, structured evidence-backed incident reports, moderation before publishing, client right of reply, and pattern aggregation for off-platform freelance work. It excludes legal recourse, enforcement, mediation, and marketplace rating imports.

## 2. Users

| User | Goal | Priority |
|------|------|----------|
| Reporting freelancer | File a credible, evidence-backed incident report about a client engagement | Primary |
| Reading freelancer | Check a client pattern of late payment, non-payment, unresponsiveness, or scope creep before engaging | Primary |
| Moderator | Review reports against proof and publish or reject with reasons | Primary |
| Named client or business | View reports about them and post a reply or clarification | Secondary |

## 3. Features

| ID | Feature | Priority | Description |
|----|---------|----------|-------------|
| PRD-F1 | Verified submission | Must-Have | Only verified freelancers can submit; verification by ID, portfolio, or account check per TBD(owner) method |
| PRD-F2 | Structured incident report | Must-Have | Fixed fields plus predefined tags (Late Payment, Non-Payment, Unresponsive, Scope Creep) instead of free text |
| PRD-F3 | Mandatory proof upload | Must-Have | Screenshot, invoice, or agreement attachment required before submission; every stored report links to proof |
| PRD-F4 | Moderation queue | Must-Have | Human review of each report against its proof before publishing; approve publishes, reject notifies with reason |
| PRD-F5 | Right of reply | Must-Have | Named client or business can post a visible reply or clarification on any published report |
| PRD-F6 | Aggregation view | Must-Have | Per-client view showing report count and tag frequency so patterns are visible, not single call-outs |

Priority vocabulary: Must-Have, Should-Have, Could-Have, Dropped. Only Must-Have features are required in the traceability matrix.

### 3.1 Acceptance criteria

One block per feature. Every Must-Have needs criteria before it can be locked.

**PRD-F1 - Verified submission**
- Given an unverified account, when it tries to open the report form, then submission is blocked with guidance on how to verify
- Given a verified account, when it submits, then the stored report carries a verified-identity marker
- 100 percent of stored submissions link to a verified account (see FLAG-M1)

**PRD-F2 - Structured incident report**
- Given a reporter, when creating a report, then tags come only from the fixed set; free-text tag creation is not possible
- Given missing required fields (client identifier, engagement period, at least one tag, structured facts), when submitting, then validation blocks with field-level errors

**PRD-F3 - Mandatory proof upload**
- Given a report draft with no attachment, when submitting, then submission is blocked until proof is attached
- Given an attached screenshot, invoice, or agreement, when submitted, then the proof is stored and linked to the report and its moderation case
- 100 percent of stored reports have at least one proof attachment (see FLAG-M2)

**PRD-F4 - Moderation queue**
- Given a submitted report, when a moderator approves, then it publishes with its moderation outcome shown; when rejected, then it stays unpublished and the reporter is notified with a reason
- Every submitted report receives a decision within 48 hours of submission (see FLAG-M3)

**PRD-F5 - Right of reply**
- Given a published report, when the named client replies, then the reply displays alongside the report with a timestamp and cannot edit or delete the original
- 100 percent of published reports offer a working reply path (see FLAG-M4)

**PRD-F6 - Aggregation view**
- Given published reports for one client, when viewing that client page, then report count and per-tag frequencies are shown
- Reports are presented in aggregate context per IDEA section 4, not as standalone single-report call-out pages

## 4. Explicit exclusions

Carried forward from IDEA section 4, plus anything cut during requirements.

| Excluded | Why | Revisit when |
|----------|-----|--------------|
| Legal advice, mediation, dispute resolution, payment enforcement | FLAG is awareness only per owner scope | Only via change record if scope ever changes |
| Escalation workflows such as collections, takedowns, work-blocking blacklists | Excluded by owner; converts awareness into enforcement | Only via change record |
| Standalone single-report call-out pages | Published signal must be aggregated with tag frequency | Only via change record |
| Importing ratings from closed marketplaces | Out of scope; unverifiable provenance | Only via change record |
| Hiring marketplace or background-check positioning | Different product with different liability | Only via change record |

## 5. Metrics

| ID | Metric | Target | How measured |
|----|--------|--------|--------------|
| FLAG-M1 | Submissions from verified accounts | 100 percent of stored submissions | Query stored reports joined to verification records |
| FLAG-M2 | Proof-attachment rate | 100 percent of stored reports have proof | Storage check per report |
| FLAG-M3 | Moderation turnaround | Decision within 48 hours per report, operational by week 8 | Timestamps from submission to decision, reviewed weekly |
| FLAG-M4 | Reply availability | 100 percent of published reports offer reply, within 10 weeks | Count published reports with working reply path |
| FLAG-M5 | Launch adoption | 50 verified users and 20 submitted reports in the first month post-launch | Product analytics at month one |

## 6. Candidates (not decided)

Ideas raised but not accepted. Nothing here may be implemented.

| Candidate | Raised by | Notes |
|-----------|-----------|-------|
| Reporter anonymity levels | feasibility note | Owner idea assumes verified identity; anonymous or pseudonymous modes need a separate decision |
| Client notification channel | feasibility note | How a named client learns a report exists - scoped link, email, or claim flow - undecided |
| Search by client alias or page | feasibility note | Helps dedupe but raises misattribution risk; needs Q2 answer first |

## 7. Open questions

- TBD(owner) Which verification checks count, and who reviews edge cases (LOG Q1)?
- TBD(owner) What key dedupes a client without misattribution (LOG Q2)?
- TBD(owner) What proof standard publishes versus rejects, and who staffs moderation (LOG Q3)?
- TBD(owner) What retention and takedown policy governs IDs, proofs, and replies (LOG Q5)?
