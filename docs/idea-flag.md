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

FLAG is a community-driven awareness platform where verified freelancers log structured, evidence-backed incident reports about clients so others can see patterns before entering an engagement.

## 2. The problem

Freelancers working through direct clients, social media, or local gigs - a large share of the Philippine freelance workforce - have no reliable shared record of client behavior. Clients who pay late, fail to pay, go unresponsive, or creep scope can repeat the same pattern with new freelancers who have no way to know. Existing freelance marketplaces only allow ratings inside their own closed ecosystems, so off-platform work has no accountability trail. The cost is repeated unpaid or underpaid work, wasted dispute effort, and freelancers entering engagements blind.

## 3. Who it is for

| User | What they need | How they work around it today |
|------|----------------|-------------------------------|
| Freelancers in direct and off-platform work | To check whether a client has a pattern of late payment, non-payment, unresponsiveness, or scope creep before accepting work | Ask around in group chats and communities; rely on anecdotes with no structure or proof |
| Freelancers who experienced an incident | To warn peers with a credible, evidence-backed report rather than an unverifiable call-out | Post screenshots or stories on social media; posts scatter and cannot be aggregated |
| Named clients and businesses open to reply | To see what is said about them and respond or clarify in one place | No shared venue; disputes play out across disconnected threads |

## 4. Out of scope

Explicit non-goals. Anything listed here must not appear in the PRD, the SDD, or the code without a change record.

- Legal advice, dispute resolution, mediation, or enforcement of payment - FLAG is awareness only
- Escalation workflows such as collections, takedowns, or blacklists that block a client from work
- Single-report public call-outs - published signal is aggregated by client with tag frequency, not one accusation alone
- Importing or mirroring ratings from closed marketplaces such as Upwork or Freelancer.com
- Functioning as a hiring marketplace or a background-check service

## 5. Success looks like

Observable outcomes, not features.

- A freelancer can check a client name and see how many reports exist and which tags recur, before deciding to engage
- Every published report links to supporting proof and shows its moderation outcome
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
