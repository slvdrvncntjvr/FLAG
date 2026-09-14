---
spine_type: SDD
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

# System Design: FLAG

**PRD:** [prd-flag.md](prd-flag.md)

---

## 1. Architecture

Target design for a web application with three user paths: verified freelancers submit reports with proof, moderators review before publishing, and readers plus named clients view aggregates and replies. No code exists yet, so this section describes intent; it must stay Draft until the owner locks it and the code matches. Deployment target and hosting are TBD(owner) per LOG Q4.

```
[ Browser: freelancer ] --> [ Web app ] --> [ API ] --> [ Database ]
[ Browser: moderator ]  --> [ Web app ] --> [ API ] --> [ Proof store ]
[ Browser: reader ]     --> [ Client pages ] --> [ API ]
[ Named client link ]   --> [ Reply path ] --> [ API ]
```

## 2. Components

| Component | Responsibility | Serves | Location |
|-----------|---------------|--------|----------|
| Identity and verification | Verify freelancer accounts; gate the report form; mark submissions | PRD-F1 | planned: web app plus API, exact paths TBD(owner) |
| Report service | Enforce fixed fields and fixed tag set; validate required fields | PRD-F2 | planned: API reports module, exact paths TBD(owner) |
| Proof store | Accept screenshot, invoice, or agreement uploads; link proof to report | PRD-F3 | planned: file store plus API attachments, exact paths TBD(owner) |
| Moderation | Queue submissions; record approve or reject with reason; publish outcome | PRD-F4 | planned: moderator view plus API review actions, exact paths TBD(owner) |
| Reply | Let the named client post a timestamped reply that cannot edit the report | PRD-F5 | planned: reply path plus API, exact paths TBD(owner) |
| Aggregation | Compute per-client report count and per-tag frequency views | PRD-F6 | planned: client pages plus API rollups, exact paths TBD(owner) |

## 3. Data model

Source of truth: TBD(owner) - no schema file exists yet; entities below are the target contract.

| Entity | Key fields | Relationships | Notes |
|--------|-----------|---------------|-------|
| Freelancer | id, display name, verification status | Has one VerificationCase; files many Reports | Only verified status may file |
| VerificationCase | id, freelancer ref, method, outcome, decided-by, decided-at | Belongs to Freelancer | Method set TBD(owner) per LOG Q1 |
| ClientProfile | id, canonical key, display name, aliases | Has many Reports and Replies | Identity key TBD(owner) per LOG Q2 |
| Report | id, freelancer ref, client ref, engagement period, tags, facts, status | Belongs to Freelancer and ClientProfile; has Proofs and one ModerationCase | Tags from fixed set only |
| Proof | id, report ref, file ref, kind (screenshot, invoice, agreement) | Belongs to Report | Retention policy TBD(owner) per LOG Q5 |
| ModerationCase | id, report ref, outcome, reason, decided-by, decided-at | Belongs to Report | Target turnaround 48 hours |
| Reply | id, report ref, body, posted-at | Belongs to Report and ClientProfile | Cannot mutate the report |

### 3.1 Migration policy

TBD(owner) - no datastore is selected yet. Once selected, schema changes must use versioned forward-only migrations that are backward compatible for reads during rollout.

## 4. API surface

Target contract; routes below are intent, not running code.

| Method | Path | Auth | Serves | Notes |
|--------|------|------|--------|-------|
| POST | /api/verifications | Signed-in freelancer | PRD-F1 | Starts a verification case; method TBD(owner) |
| POST | /api/reports | Verified session only | PRD-F1, PRD-F2 | Rejects unverified callers |
| POST | /api/reports/id/proofs | Verified session, report owner | PRD-F3 | Screenshot, invoice, or agreement; required before submit completes |
| GET | /api/moderation/queue | Moderator role | PRD-F4 | Lists pending cases oldest first |
| POST | /api/moderation/cases/id/decision | Moderator role | PRD-F4 | Approve publishes; reject records reason |
| POST | /api/reports/id/replies | Scoped client token, TBD(owner) | PRD-F5 | Reply is timestamped and immutable |
| GET | /api/clients/key | TBD(owner) read policy | PRD-F6 | Returns report count plus per-tag frequency |

## 5. Cross-cutting concerns

| Concern | Approach | Serves |
|---------|----------|--------|
| Authentication | Signed-in sessions for freelancers and moderators; scoped reply tokens for named clients; exact provider TBD(owner) | PRD-F1, PRD-F4, PRD-F5 |
| Authorization | Only verified accounts call report write paths; only moderator role calls review paths | PRD-F1, PRD-F4 |
| Validation | Server-side enforcement of fixed fields, fixed tag set, and mandatory proof; client-side checks mirror but never replace | PRD-F2, PRD-F3 |
| Error handling | Field-level validation errors on submit; not-found on unknown client keys; forbidden on unverified writes; exact format TBD(owner) with stack choice | PRD-F1, PRD-F2, PRD-F3 |
| Secrets | No keys or tokens in docs or code; secrets live in TBD(owner) secret store; env files stay gitignored | All IDs |
| Rate limiting | Throttle report creation, proof upload, and reply posting per account and per network; exact limits TBD(owner) | PRD-F1, PRD-F3, PRD-F5 |

Read exposure note: no unauthenticated write surface exists in this design. Whether aggregation reads are public or signed-in-only is TBD(owner); default to signed-in reads until the owner decides, since public client pages raise defamation and scraping risk.

## 6. Feature-to-design map

Every Must-Have PRD-F# appears here.

| PRD-F# | Designed | Components | RFC |
|--------|----------|------------|-----|
| PRD-F1 | yes | Identity and verification, Report service | N/A |
| PRD-F2 | yes | Report service | N/A |
| PRD-F3 | yes | Proof store, Report service | N/A |
| PRD-F4 | yes | Moderation | N/A |
| PRD-F5 | yes | Reply | N/A |
| PRD-F6 | yes | Aggregation | N/A |

## 7. Rejected alternatives

| Considered | Rejected because |
|-----------|------------------|
| Free-text-only reports | Cannot be aggregated into tag frequency; breaks the pattern-visibility goal |
| Publishing without moderation | Raises false-report and defamation risk; contradicts the owner review requirement |
| Standalone single-report call-out pages | Contradicts IDEA section 4; signal must be aggregate, not one accusation |
| Legal or escalation module in v1 | Out of scope per IDEA section 4; awareness only |

## 8. Open questions

- TBD(owner) Verification method and edge-case reviewers (LOG Q1)?
- TBD(owner) Client identity key and dedupe rule (LOG Q2)?
- TBD(owner) Proof standard and moderation staffing (LOG Q3)?
- TBD(owner) Deployment target, stack, and budget (LOG Q4)?
- TBD(owner) Retention and takedown policy for IDs, proofs, and replies (LOG Q5)?
