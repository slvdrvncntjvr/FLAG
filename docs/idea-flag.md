---
spine_type: IDEA
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

# Idea Brief: FLAG - Freelancer Log for Awareness and Guidance

---

## 1. One-line summary

FLAG is a moderated engagement log where verified Philippine freelancers record proof-backed outcomes of work with clients who are registered on the platform and accepted the engagement, so the next freelancer can see a client's full record before taking the job.

## 2. The problem

Freelancers who work through direct clients, social media, and local gigs - a large share of the Philippine freelance workforce - have no shared record of how a client behaves. Upwork and Freelancer.com ratings stay inside their own platforms. What exists instead is unmoderated "freedom wall" pages and public callout posts: disorganized, mostly negative, rarely backed by proof, and a legal risk for the freelancer who posts them. Good clients cannot show they pay on time, and bad patterns (late payment, non-payment, going silent, scope creep) hit each new freelancer without warning.

## 3. Who it is for

| User | What they need | How they work around it today |
|------|----------------|-------------------------------|
| Freelancer checking a client | See how past engagements with this client went - share on time and clean versus late, unpaid, unresponsive, or creeping - before accepting work | Asking in group chats; scrolling freedom-wall pages with no structure or proof |
| Freelancer finishing an engagement | Record what happened, good or bad, with proof, without exposing themselves to a libel complaint | Posting screenshots on Facebook; praise disappears and complaints scatter |
| Client registered on FLAG | Accept engagements, see what is logged about them, reply in one place, and build a visible on-time record | No venue; disputes play out across disconnected threads |
| Moderator (project team at pilot) | Check every log and every verification against its proof before anything is visible | Not applicable today |

## 4. Out of scope

Explicit non-goals. Anything listed here must not appear in the PRD, the SDD, or the code without a change record.

- Legal advice, dispute resolution, mediation, or payment enforcement. FLAG is an awareness tool only.
- Escalation workflows: collections, takedown demands against clients, blacklists that block a client from working.
- Logs about businesses or people who do not have a FLAG account and did not accept the engagement. There are no profiles created on someone's behalf.
- Single-entry callout pages. A log is always shown inside its client's aggregate record.
- Star scores, ratings, rankings, leaderboards, or endorsement badges, for clients or freelancers.
- Hiring marketplace features: clients browsing, searching, or recruiting freelancers; job posts; proposals.
- Payments, escrow, or invoicing through FLAG.
- Importing or mirroring ratings from Upwork, Freelancer.com, or any other platform.
- Background-check or credit-check positioning.
- Native mobile apps and third-party platform integrations for v1.

### 4.1 Invariants (must-never rules)

Rules the product must never break, in any feature, at any time. Each one is traced to where it is enforced and to a negative test that tries to break it (`INDEX` §3.1). Confirmed by the owner on 2026-10-12.

| ID | The product must never | Why | Status |
|----|------------------------|-----|--------|
| INV-1 | Publish an engagement log that a human moderator has not approved | Unreviewed claims about named businesses are the libel and false-report risk FLAG exists to avoid | Active |
| INV-2 | Accept an engagement log that has no proof file, or that is attached to an engagement the client did not accept | Proof and client consent are the two facts that separate FLAG from a freedom wall | Active |
| INV-3 | Store a raw government ID image or a full government ID number | ID images are high-risk personal data under the Data Privacy Act; a breach would be severe | Active |
| INV-4 | Show a proof file to anyone other than moderators, the freelancer who filed it, and the named client | Proof files contain chats, amounts, and personal data of both parties | Active |
| INV-5 | Compute or display a score, star rating, rank, or leaderboard for any client or freelancer | A score turns pattern context into a recommendation, with different liability, and invites gaming | Active |
| INV-6 | Let a client edit or delete a published engagement log | The client's channel is the reply; changing the record would defeat it | Active |
| INV-7 | Serve client records or engagement logs to signed-out visitors or search engines | Public, indexed pages raise defamation and scraping exposure | Active |
| INV-8 | Let a freelancer file a log or corroborate before they are verified and have completed the onboarding acknowledgment | Every claim must trace to an accountable, informed person | Active |

Status vocabulary: `Active`, `Retired`.

## 5. Success looks like

- A freelancer types a client's name and, within a few seconds on a mid-range Android phone, sees how many engagements were logged, how many were positive, mixed, or flagged, and which tags recur.
- Every visible log has proof that a moderator reviewed, a review date, and a reply from the client if they gave one.
- At least 90 percent of submissions get a moderator decision within 48 hours.
- Every freelancer who files has been verified and has acknowledged the proof requirement and the awareness-only boundary.
- The pilot runs with 20 to 30 participants (students, part-timers, non-professional freelancers) and reaches at least 80 percent satisfaction in the post-test survey.

## 6. Constraints

| Kind | Constraint | Source |
|------|-----------|--------|
| Time | Course schedule: onboarding and legal module Oct 12-31; verification and client registration Nov 1-14; report form and proof Nov 8-21; moderation and corroboration Nov 15-28; pilot and UAT Nov 29 - Dec 12; buffer to Dec 16; final documents Dec 17-23, 2026 | group_context tracker, GEN ROADMAP and WBS sheets |
| People | Three developers, two QA, two documentation, one project manager; the team staffs moderation during the pilot | group_context Directory sheet; owner 2026-10-12 |
| Platform | Cloudflare | owner 2026-10-12 |
| Cost | Student budget; free tiers wherever possible. Exact ceiling `TBD(owner)` | owner |
| Legal | Data Privacy Act of 2012 (RA 10173): privacy notice, consent, retention, and a named contact for data requests. Cyber libel exposure (RA 10175) for logs about named businesses | group docs Goal 1; feasibility notes |
| Language | English only in the product | owner 2026-10-12 |
| Copy | Product copy states facts plainly. No filler like "this is for..." or marketing phrasing | owner 2026-10-12 |

## 7. Open questions

Questions blocking downstream docs. Mirrored into `LOG`.

- `TBD(owner)` What does a freelancer without a PhilID or ePhilID use to verify, given INV-3? (LOG Q8)
- `TBD(owner)` Who is the named data protection contact, and what retention period applies to proofs, logs, and replies? (LOG Q5)
- `TBD(owner)` What per-account, per-client, and per-network limits stop praise-stuffing and pile-ons? (LOG Q7)
- `TBD(owner)` What is the monthly hosting ceiling after the pilot? (LOG Q4)
