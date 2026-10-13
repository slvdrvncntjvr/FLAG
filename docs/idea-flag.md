---
spine_type: IDEA
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 1.0
status: Locked
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-13
reconciled: 2026-10-13
---

# Idea Brief: FLAG - Freelancer Log for Awareness and Guidance

---

## 1. One-line summary

FLAG is an awareness-only moderated engagement log where verified Philippine freelancers record proof-backed outcomes of work with clients who are registered on the platform and accepted the engagement, each with a 1-5 rating, so the next freelancer can see a client's average and recent record from the past 12 months before taking the job.

## 2. The problem

Freelancers who work through direct clients, social media, and local gigs - a large share of the Philippine freelance workforce - have no shared record of how a client behaves. Upwork and Freelancer.com ratings stay inside their own platforms. What exists instead is unmoderated "freedom wall" pages and public callout posts: disorganized, mostly negative, rarely backed by proof, and a legal risk for the freelancer who posts them. Good clients cannot show they pay on time, and bad patterns (late payment, non-payment, going silent, scope creep) hit each new freelancer without warning.

## 3. Who it is for

| User | What they need | How they work around it today |
|------|----------------|-------------------------------|
| Freelancer checking a client | See a client's average rating, outcome counts, and how past engagements went - on time and clean versus late, unpaid, unresponsive, or creeping - before accepting work | Asking in group chats; scrolling freedom-wall pages with no structure or proof |
| Freelancer finishing an engagement | Record what happened, good or bad, with a 1-5 rating and supporting proof through a private moderated process | Posting screenshots on Facebook; praise disappears and complaints scatter |
| Client registered on FLAG | Accept engagements, see their own record, and request a private review of a log in one place | No venue; disputes play out across disconnected threads |
| Moderator (project team at pilot) | Check every log and every verification against its proof before anything is visible | Not applicable today |

## 4. Out of scope

Explicit non-goals. Anything listed here must not appear in the PRD, the SDD, or the code without a change record.

- Legal advice, dispute resolution, mediation, or payment enforcement. FLAG is an awareness tool only.
- Escalation workflows: collections, takedown demands against clients, blacklists that block a client from working.
- Logs about businesses or people who do not have a FLAG account and did not accept the engagement. There are no profiles created on someone's behalf. A client refusing an engagement is out of scope: refusal produces no warnings and no negative signal.
- Single-entry callout pages. A log is always shown inside its client's aggregate record.
- Public replies or public response threads on logs. The client's channel is a private request for review (PRD-F13).
- Corroboration, same-experience clicks, upvotes, or any count of who agreed with a log. Each experience is independently submitted and reviewed.
- Any reputation signal beyond the approved ones: ranks, leaderboards, endorsement or trust badges, or any other score. Only the approved 1-5 per-log rating and the client average derived from it are permitted (INV-5).
- Hiring marketplace features: clients browsing, searching, or recruiting freelancers; job posts; proposals.
- Payments, escrow, or invoicing through FLAG.
- Importing or mirroring ratings from Upwork, Freelancer.com, or any other platform.
- Background-check or credit-check positioning.
- Coursework milestones as feature requirements. The course schedule is context only and imposes no feature requirements.
- Native mobile apps and third-party platform integrations for v1.

### 4.1 Invariants (must-never rules)

Rules the product must never break, in any feature, at any time. Each one is traced to where it is enforced and to a negative test that tries to break it (`INDEX` §3.1). Confirmed by the owner on 2026-10-12.

| ID | The product must never | Why | Status |
|----|------------------------|-----|--------|
| INV-1 | Publish an engagement log that a human moderator has not approved | Unreviewed claims about named businesses are the libel and false-report risk FLAG exists to avoid | Active |
| INV-2 | Accept an engagement log that has no proof file, or that is attached to an engagement the client did not accept | Proof and client consent are the two facts that separate FLAG from a freedom wall | Active |
| INV-3 | Store a raw government ID image or a full government ID number | ID images are high-risk personal data under the Data Privacy Act; a breach would be severe | Active |
| INV-4 | Show a proof file to anyone other than moderators, the freelancer who filed it, and the named client | Proof files contain chats, amounts, and personal data of both parties | Active |
| INV-5 | Compute or display any reputation signal — score, rank, leaderboard, endorsement or trust badge — other than the approved 1-5 per-log rating and the client average derived from it | Only the approved 1-5 rating and its client average are permitted; any other signal turns pattern context into a recommendation, with different liability, and invites gaming | Active |
| INV-6 | Let a client edit or delete a published engagement log | Direct edits would defeat the moderated frozen record; corrections go through private review (PRD-F13) | Active |
| INV-7 | Serve client records or engagement logs to signed-out visitors or search engines | Public, indexed pages raise defamation and scraping exposure | Active |
| INV-8 | Let a freelancer open an engagement or file a log before they are verified and have completed the onboarding acknowledgment | Every claim must trace to an accountable, informed person | Active |

Status vocabulary: `Active`, `Retired`.

## 5. Success looks like

- A freelancer types a client's name and, within a few seconds on a mid-range Android phone, sees the client's average 1-5 rating with its contributor count (or Limited record under five contributors), outcome counts derived from the ratings, and which tags recur.
- Every visible log has a 1-5 rating, proof that a moderator reviewed, a review date, and a private correction path if challenged. No public replies, no corroboration counts, no ranks or leaderboards appear anywhere.
- At least 90 percent of submissions get a moderator decision within 48 hours; correction requests get an independent moderator decision with a 48-hour target.
- Every freelancer who files has been verified by manual live ID inspection (identity checked, never a trustworthiness guarantee) and has acknowledged the proof requirement and the awareness-only boundary.
- Published experiences and proofs expire 12 months after original publication; an empty record states the rolling window plainly and implies nothing about safety.
- The pilot runs with 20 to 30 participants (students, part-timers, non-professional freelancers) and reaches at least 80 percent satisfaction in the post-test survey.

## 6. Constraints

| Kind | Constraint | Source |
|------|-----------|--------|
| Time | Course schedule is context only and imposes NO feature requirements: onboarding and legal module Oct 12-31; verification and client registration Nov 1-14; report form and proof Nov 8-21; moderation Nov 15-28; pilot and UAT Nov 29 - Dec 12; buffer to Dec 16; final documents Dec 17-23, 2026. As-built today is auth/onboarding only (PRD-F7, PRD-F8); other product flows are planned | group_context tracker, GEN ROADMAP and WBS sheets; owner 2026-10-13 |
| People | Three developers, two QA, two documentation, one project manager; the team staffs moderation during the pilot | group_context Directory sheet; owner 2026-10-12 |
| Platform | Cloudflare | owner 2026-10-12 |
| Cost | Student budget; free tiers only for the pilot. Ceiling (owner 2026-10-13): hard stop before any paid upgrade; stay within Cloudflare Workers/D1/R2 free limits; owner is alerted before approaching any free-tier cap and approves any spend explicitly | owner |
| Legal | Data Privacy Act of 2012 (RA 10173): privacy notice, consent, retention, and a named contact for data requests. Cyber libel exposure (RA 10175) for logs about named businesses | group docs Goal 1; feasibility notes |
| Language | English only in the product | owner 2026-10-12 |
| Copy | Product copy states facts plainly. No filler like "this is for..." or marketing phrasing | owner 2026-10-12 |

## 7. Open questions

Questions blocking downstream docs. Mirrored into `LOG`.

- Resolved 2026-10-13 (LOG Q7): per-account, per-client, and per-network limits that stop praise-stuffing and pile-ons are the approved pilot caps recorded in SDD §5 Rate limiting (daily invite/log quotas per freelancer, one log per engagement capped at three per 12-month freelancer/client pair, burst limits on sign-in and uploads per IP and user).
- Technical future deferred: automatic QR/primary-source ID checking (LOG Q13) stays out of primary requirements until technically proven; pilot verifies by manual live inspection.
