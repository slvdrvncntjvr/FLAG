---
spine_type: IDEA
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

# Idea Brief: FLAG - Freelancer Log for Awareness and Guidance

---

## 1. One-line summary

FLAG is a community-kept engagement log where verified freelancers record structured, evidence-backed outcomes about clients, positive and negative, so others can see the full pattern before entering an engagement.

## 2. The problem

Freelancers working through direct clients, social media, or local gigs - a large share of the Philippine freelance workforce - have no reliable shared record of client behavior. Good clients are invisible and bad patterns repeat: on-time payment and clear scope go unrecorded while late payment, non-payment, unresponsiveness, and scope creep hit each new freelancer blind. Existing marketplaces only allow ratings inside closed ecosystems, and complaint-only boards skew negative with no base rate. The cost is repeated unpaid work on one side and good clients who cannot prove they are good on the other.

## 3. Who it is for

| User | What they need | How they work around it today |
|------|----------------|-------------------------------|
| Freelancers in direct and off-platform work | To check the full pattern for a client, share of on-time and clean engagements versus late, unpaid, unresponsive, or creeping ones, before accepting work | Ask around in group chats and communities; rely on anecdotes with no structure or proof |
| Freelancers who finished an engagement | To log what happened, good or bad, with proof, so the next person gets base rate plus incidents | Post screenshots or stories on social media; praise vanishes and complaints scatter with no aggregate |
| Named clients and businesses open to reply | To see what is said about them and respond or clarify in one place | No shared venue; disputes play out across disconnected threads |

## 4. Out of scope

Explicit non-goals. Anything listed here must not appear in the PRD, the SDD, or the code without a change record.

- Legal advice, dispute resolution, mediation, or enforcement of payment - FLAG is awareness only
- Escalation workflows such as collections, takedowns, or blacklists that block a client from work
- Single-report public call-outs - published signal is aggregated by client with outcome ratio and tag frequency, not one entry alone
- Importing or mirroring ratings from closed marketplaces such as Upwork or Freelancer.com
- Functioning as a hiring marketplace, endorsement wall, or background-check service - positive logs are pattern context, not recommendations
- Star scores or ranked leaderboards - distribution is shown, clients are never ranked

## 5. Success looks like

Observable outcomes, not features.

- A freelancer can check a client name and see engagements logged, share positive versus flagged, and which tags recur, before deciding to engage
- Every published entry links to supporting proof and shows its moderation outcome, whether the outcome is positive or flagged
- Moderation decisions complete within 48 hours per report
- Every published report offers the named client a visible way to respond
- Within the first month post-launch: 50 verified users and 20 submitted reports

## 6. Constraints

| Kind | Constraint | Source |
|------|-----------|--------|
| Time | Verification live within 4 weeks; report plus proof within 6 weeks; moderation queue by week 8; reply by week 10 | owner SMART goals |
| Platform | Hosting and stack TBD(owner) - no manifest exists yet | TBD(owner) |
| Cost | Budget and moderation staffing TBD(owner) | TBD(owner) |
| Trust and safety | Must handle defamation and false-report risk; review flow required before publishing; exact policy TBD(owner) | owner idea plus feasibility note |
| Privacy | Handling of personal data and ID documents must follow a stated retention policy; policy TBD(owner) | feasibility note |

## 7. Open questions

Questions blocking downstream docs. Mirrored into LOG.

- TBD(owner) How is freelancer verification performed - which ID, portfolio, or account checks, and who reviews edge cases?
- TBD(owner) How is a client identity resolved and deduped - by business name, page, email domain, or another key - without enabling misattribution?
- TBD(owner) Who staffs moderation, and what proof standard publishes versus rejects a report?
- TBD(owner) What is the deployment target and hosting budget for launch?
- TBD(owner) What data-retention and takedown policy governs IDs, proofs, and replies?
