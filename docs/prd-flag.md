---
spine_type: PRD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.3
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-11-01
reconciled: 2026-10-13
---

# Product requirements: FLAG

**Intent:** [IDEA](idea-flag.md). **Implementation status:** [INDEX §6](index.md#6-current-development-baseline).
These are the approved v1 requirements, including unfinished features.

## 1. Scope statement

Verified Philippine freelancers record proof-backed experiences about registered
clients who accepted an engagement. Human-approved logs appear in the client's
signed-in record with a 1-5 rating, client average, outcome counts and tags.
Clients use private correction, never direct publication edits or public replies.

## 2. Users

Freelancers read records and file experiences; clients accept engagements and
read/challenge their own records; moderators verify identity and review evidence;
admins manage roles, suspensions and privacy requests. Admin is not blanket proof
access.

## 3. Features

| ID | Feature | Priority | Description |
|----|---------|----------|-------------|
| PRD-F1 | Freelancer verification | Must-Have | Manual live ID inspection and portfolio; identity checked, never a trust guarantee |
| PRD-F2 | Structured engagement log | Must-Have | One factual, rated log per accepted engagement, submitted inside its filing window |
| PRD-F3 | Mandatory proof | Must-Have | Private proof for every log, including positive experiences |
| PRD-F4 | Moderation | Must-Have | Human review, claim leases, reasoned decisions and audit history |
| PRD-F5 | Public right of reply (Retired) | Dropped | Replaced by private correction; ID retained |
| PRD-F6 | Client record | Must-Have | Signed-in search, eligible publications, average, contributor count, outcomes and tags |
| PRD-F7 | Accounts and sign-in | Must-Have | Email one-time codes; optional configured Google; server-controlled staff roles |
| PRD-F8 | Onboarding | Must-Have | Current privacy/terms and freelancer acknowledgment |
| PRD-F9 | Engagement handshake | Must-Have | Invitation, registered client, explicit association and engagement consent, accept or decline |
| PRD-F10 | Corroboration (Retired) | Dropped | No upvotes or agreement counts; ID retained |
| PRD-F11 | Feature notifications | Should-Have | Email on invite, response and review/publication decisions; separate from sign-in email |
| PRD-F12 | Data and retention | Must-Have | Recorded privacy requests, assessed closure/erasure, retention and documented holds |
| PRD-F13 | Private correction and filer updates | Must-Have | Independent moderator review with history and unchanged original retention clock |
| PRD-F14 | Ratings | Must-Have | Integer 1-5 per log; latest eligible contribution per distinct freelancer/client pair |

### 3.1 Acceptance criteria

**PRD-F1 - Verification**

- Require at least one portfolio link and live inspection of PhilID/ePhilID,
  passport or driver licence. Never collect an ID upload, number, QR payload or
  ID-derived hash. No phone-code or paid-SMS step.
- Before inspection, evidence fields are empty. Record only reviewer, method,
  ID type, pass/fail, name match and inspection time, plus approved profile and
  portfolio information. Preserve the submitted name/city/portfolio snapshot.
- Approve only after a passing inspection and matching name, with a reason.
  Reject with a reason visible to the freelancer. Rejection permits a corrected
  new request while the prior request/decision remains immutable.
- Verification means identity checked. Automatic QR checking remains deferred.

**PRD-F2 - Log**

- One log per accepted engagement. Require integer rating 1-5, one or more fixed
  tags, 40-2,000 characters of facts, and real ordered covered-period dates.
  Optional amount is a nonnegative integer in centavos, with no conversion.
- Tags: On-time Payment, Clear Scope, Responsive, Professional, Late Payment,
  Non-Payment, Unresponsive, Scope Creep. Tags never override the rating-derived
  outcome; a positive log may carry a Late Payment tag.
- The filing anchor is completion, termination, or the first missed agreed
  payment/milestone during ongoing work. The initial complete submission is due
  within 15 calendar days in Asia/Manila, inclusive of anchor+15: April 1 permits
  April 16, not April 17. Reject future anchors. The covered period is separate
  from the anchor. A moderator checks the evidence supporting the event date.
- States: draft, pending, ask_changes, published, hidden, withdrawn, rejected,
  expired. Only eligible approved publications enter a client record.
  Ask-changes resubmission continues an initially complete/on-time filing; neither
  moderation delay, later nonpayment nor an update resets its anchor or clock.

**PRD-F3 - Proof**

- Submit requires 1-5 JPEG, PNG, WebP or PDF files, each 1-10,485,760 bytes
  (10 MiB). Enforce signatures and real size, not filenames or supplied MIME.
- Images are re-encoded on-device to remove camera/location metadata. Proof
  still must exclude IDs and unrelated personal information; metadata removal
  does not remove visible content or establish PDF safety.
- Only the filer, named client and actual moderators may read proof. Deny
  unrelated accounts, signed-out users and bare admins with 404. Never expose
  public bucket URLs. Publication requires moderator-approved proof.

**PRD-F4 - Review**

- Queue is oldest first with case kind and waiting age; mark overdue after
  36 hours. Claim lease lasts 30 minutes. Claim, release and decision are audited.
- Verification: approve/reject. Logs and filer updates: approve/ask-changes/reject.
  Corrections: uphold/ask-changes/correct/withdraw. Decisions require reasons.
- Approve log evidence only when it establishes the engagement with that client
  and makes the claimed event visible or strongly implied. Ask-changes or reject
  edited/unverifiable evidence, no identifiable client, one-sided material with
  no client interaction, or a rating unsupported by proof. Opinions alone fail.
- Reject conflicted reviewers: filer, named client, or someone engaged with that
  client. Correction reviewer must also differ from the original log decider.
  Recheck role, suspension and lease inside the atomic transition; races admit
  one winner and leave no partial subject/profile/audit effects.

**PRD-F6 - Record**

- Signed-in freelancers search registered client names; matching results show
  each client's engagement count. Freelancers read client records; clients read
  their own. Never auto-merge equal names or expose contacts/IDs.
- Show average to one decimal, distinct contributor count, Limited record below
  five contributors, published-log total, derived outcome counts, tag counts and
  newest-first logs with filer names and approved dated updates.
- Exclude draft/pending/ask-changes/rejected/hidden/withdrawn/expired material from
  history, counts and averages on every read. Never expose correction requests,
  counter-proof, reviewer notes or invalidated prior content to ordinary readers.
- Empty state: "No published experiences in the past 12 months"; no score, zero
  stars, safety implication, rank, competitive ordering or endorsement.

**PRD-F7, PRD-F8 - Accounts and onboarding**

- Email-code sign-in is the pilot method; Google is optional when configured.
  Password sign-in/reset/credential creation is disabled. Staff roles are
  assigned by an admin; signup/profile input cannot grant them.
- Require current privacy/terms; freelancers also confirm all three statements:
  logs need proof, FLAG is not legal advice or dispute resolution, and false logs
  lead to removal and possible account suspension. A policy change requires
  reacceptance. These acceptances do not constitute consent to a particular
  engagement.
- Deny banned accounts; successful logout revokes the stored session, and a
  failed revocation must leave a truthful retry path.

**PRD-F9 - Engagement**

- Verified/acknowledged freelancer supplies title, client-name hint and start
  date. The invite expires after 14 days and works once; tokens are stored hashed.
- A live public invite reveals the title and inviting freelancer, not private
  profile/consent details. Client signs in, then separately and initially
  unchecked accepts account/profile association and engagement-specific consent.
- One profile per client account: display name, individual/business kind,
  city and optional DTI/SEC registration number. New-profile acceptance requires
  city; existing profiles, including legacy NULL-city profiles, remain reusable
  through explicit association without migration or backfill. Never self-invite
  or merge on names. Disputed identity uses engagement and business/location evidence.
- Acceptance atomically creates a fresh versioned consent receipt linked to
  exactly one engagement. Decline needs neither a profile nor consent and
  creates no negative signal. Reuse, expiry, wrong/stale targets and races must
  not mutate an unrelated engagement or leave losing profile/consent writes.

**PRD-F12 - Lifecycle**

- Record export/correction/deletion/closure requests, responsible processing and
  outcomes. Email may receive requests; the named privacy owner must process and
  record them. A polished self-service interface may follow later.
- Published logs/proofs expire 12 months after original publication; updates
  never restart retention. Withdrawn logs leave visible history and rating
  immediately but retain the original deletion deadline. Holds delay private
  deletion only, never visibility or rating eligibility.
- Idle drafts and abandoned unpublished ask-changes material: 30 days inactive,
  closing abandoned cases first. Rejected material: 30 days after final decision.
  An abandoned proposed update deletes only the unapproved revision/proofs,
  preserving an eligible active publication and its original deadline.
- Minimal verification/moderation/correction/audit history: 12 months after its
  own actual case close. Current policy acceptance remains while needed to gate
  an active account; retired rows expire 12 months after policy/purpose end or
  account closure. Document bounded review/legal holds; never retain every row
  indefinitely merely because an account remains active.
- Assess closure individually within 30 days, deactivate/revoke access, and
  remove data as the assessment permits. Do not cascade-delete retained evidence
  or consent/history. Keep a publication's filer name only where lawful assessed
  retention permits it. Earlier required erasure hides/withdraws the affected
  publication and recalculates; no anonymous publication or blanket refusal.
- Enforce physical D1/R2 erasure and assessed backup/hold handling. Hiding on read
  is insufficient. Minimum safe lifecycle and correction capabilities precede
  real proof collection or publication.

**PRD-F13 - Correction and update**

- Named client may request private review with counter-proof whenever the record
  exists. One open request per log; repeat requests require new evidence.
- Independent unconflicted reviewer targets 48 hours; uphold, ask-changes,
  correct or withdraw with reasons and private history. A request alone never
  hides a log; credible error/privacy risk may temporarily hide it. Opinion
  disagreement alone is not a reason for removal.
- A filer may propose a later-dated update, including changed payment status and
  rating. Show it only after moderator approval. Preserve original publication
  and expiry dates; readers see only approved dated update metadata.
- Clients cannot directly edit/delete publications.

**PRD-F14 - Rating calculation**

- Integer 1-5 derives Negative (1-2), Mixed (3), Positive (4-5).
- Filter eligible parent logs first: published, unexpired/unhidden, with approved
  active current revision. Order original published_at descending, ref ascending
  for ties. Choose the latest eligible log per distinct freelancer/client pair
  and average its current approved rating; one contributor, one vote.
- Show the first contributor's average and count; Limited record below five
  distinct contributors. A newer ineligible log falls back to the pair's older
  eligible log. Pending/rejected updates never replace the active rating.

Retired PRD-F5 and PRD-F10 are never implemented or reused.

## 4. Explicit exclusions

IDEA §4 is authoritative: no dispute/payment enforcement, unregistered or refusing
client logs, public replies/corroboration, unapproved reputation signals,
marketplace, payments, imported ratings, background checks, native app or v1
third-party integrations. Clients do not rate freelancers. Course dates do not
add product requirements.

### 4.1 Must-never rules

| INV-# | The system shall never | Constrains |
|-------|------------------------|------------|
| INV-1 | Make a log visible to anyone other than its filer, its client, and moderators unless a moderator approved it | PRD-F2, PRD-F4, PRD-F6 |
| INV-2 | Store a submitted log that has no proof file or whose engagement is not in the accepted state | PRD-F2, PRD-F3, PRD-F9 |
| INV-3 | Persist a government ID image or a full ID number in the database, file store, logs, or analytics | PRD-F1 |
| INV-4 | Return a proof file to a user who is not a moderator, the filer, or the named client | PRD-F3, PRD-F6 |
| INV-5 | Compute, store, or render any reputation signal — score, rank, leaderboard, endorsement or trust badge — other than the approved 1-5 per-log rating and the client average derived from it | PRD-F6, PRD-F14 |
| INV-6 | Accept an edit or delete of a published log from a client account | PRD-F13, PRD-F14 |
| INV-7 | Serve a client record or log to an unauthenticated request or to a crawler | PRD-F6, PRD-F7 |
| INV-8 | Accept a log or an engagement from a freelancer who is not verified or lacks a current onboarding acknowledgment | PRD-F1, PRD-F8, PRD-F9, PRD-F2 |

## 5. Metrics

| ID | Metric | Target | How measured |
|----|--------|--------|--------------|
| FLAG-M1 | Logs from verified accounts | 100 percent of stored logs | Query logs joined to freelancer verification status |
| FLAG-M2 | Proof-attachment rate | 100 percent of submitted logs have at least one proof file | Count logs with no proof row |
| FLAG-M3 | Moderation turnaround | At least 90 percent of cases decided within 48 hours | Case created and decided timestamps, reviewed weekly |
| FLAG-M4 | Public reply availability (Retired) | Retired 2026-10-13; public replies removed, see PRD-F13 | N/A |
| FLAG-M5 | Pilot participation | 20 to 30 pilot participants during Nov 29 - Dec 12, 2026 | Accounts created during the pilot window |
| FLAG-M6 | Outcome distribution (descriptive, no target) | No quota; report share of Negative / Mixed / Positive derived from ratings | Published logs by derived outcome |
| FLAG-M7 | Corroboration rate (Retired) | Retired 2026-10-13; corroboration removed, see PRD-F10 | N/A |
| FLAG-M8 | Pilot satisfaction | At least 80 percent satisfied in the post-test survey | Survey run by QA |
| FLAG-M9 | Onboarding acknowledgment | 100 percent of filing accounts acknowledged the current policy version | Join logs to acknowledgments |
| FLAG-M10 | Rating and average integrity | 100 percent of published logs carry a 1-5 rating; every shown client average equals the mean of the latest eligible approved published rating per distinct contributor with its count | Query logs and averages; spot-check Limited-record labelling under five contributors |
| FLAG-M11 | Correction turnaround | At least 90 percent of correction requests decided by an independent moderator within 48 hours | Correction request created and decided timestamps, reviewed weekly |
| FLAG-M12 | Retention compliance | 100 percent of expired published records removed from visible history and rating on schedule; 100 percent of holds documented | Retention job log plus hold register, reviewed weekly |


## 6. Candidates (not decided)

Facebook sign-in, clients rating freelancers, business team accounts, collusion
alerts and paid verification vendors are not adopted. Paid verification also
conflicts with the pilot budget and no-ID-storage boundary. No dependency is
installed solely because an old proposal mentioned it.

The existing Messenger external-browser help is retained as optional support
copy under the owner's 2026-10-31 delegated judgment. It is not a new integration,
required browser platform, device gate or unfinished scope decision.

## 7. Open questions

None blocking the approved product scope. Future QR feasibility is deferred;
unfinished lifecycle engineering is listed in INDEX, not represented as a new
owner approval question.
