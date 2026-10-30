---
spine_type: PRD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.0
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-26
reconciled: 2026-10-13
---

# Product Requirements: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)

---

## 1. Scope statement

FLAG v1 is awareness-only: verified freelancers open an engagement with a client who registers and accepts it, then file one proof-backed log per accepted engagement with an integer 1-5 rating from which Negative/Mixed/Positive is derived automatically. Every log is human-reviewed before signed-in freelancers see it in the client's record with its average, counts, and tags; the client sees their own record and uses a private correction path, never a public reply or direct edit. It excludes logs about unregistered or refusing parties, public replies, corroboration clicks, unapproved scores/ranks/leaderboards/endorsements, hiring or payment features, and public or indexed pages.

## 2. Users

| User | Goal | Priority |
|------|------|----------|
| Freelancer (reader) | Look up a client and read their average, counts, tags, and published logs before accepting work | Primary |
| Freelancer (filer) | Open an engagement, then log its outcome with a 1-5 rating and proof within the filing window | Primary |
| Client | Accept engagements, see their own record, request private review of a log | Primary |
| Moderator | Decide verifications, logs, and correction requests against proof; independent and unconflicted; 48-hour targets | Primary |
| Admin | Manage moderator roles, suspend accounts, handle data and retention requests | Secondary |

## 3. Features

IDs PRD-F1 to PRD-F6 are carried from doc_version 0.1 with the same meaning except where retired below; PRD-F7 onward are new in 0.2; PRD-F14 is new in 0.3. Retired IDs stay defined and are never reused.

| ID | Feature | Priority | Description |
|----|---------|----------|-------------|
| PRD-F1 | Freelancer verification | Must-Have | A freelancer becomes verified after manual live inspection of a supported government ID (PhilID/ePhilID, passport, or driver licence) plus portfolio links and moderator approval; the moderator views the live ID but never collects, uploads, records, or stores any raw ID image or full number and no ID proof is attached in the backend; the badge means identity checked, never a guarantee of trustworthiness; no paid SMS; automatic QR scan deferred until technically proven |
| PRD-F2 | Structured engagement log | Must-Have | One log per accepted engagement: integer 1-5 rating plus fixed factual tags, covered work period (start/end dates stored on the revision, separate from the filing anchor), optional amount in centavos, written facts; outcome (Negative/Mixed/Positive) derived automatically from the rating; filing only inside the 15-calendar-day eligibility window with submission on time |
| PRD-F3 | Mandatory proof upload | Must-Have | At least one proof file on every log, positive and negative alike, visible only to the parties and moderators; no log publishes without approved proof |
| PRD-F4 | Moderation queue | Must-Have | Human review of every verification, log, and correction request before it takes effect, with claim, a required reason, and an audit trail; kind-specific decisions with history per §3.1. Approved proof standard (LOG Q9, owner 2026-10-13): a moderator approves only when the proof shows (a) the named engagement existed with that client and (b) the claimed outcome event (payment, non-payment, scope change, silence) is visible or strongly implied; ask-changes or reject when the proof has no identifiable client, is edited or unverifiable, shows only the filer's side with no client interaction, or the 1-5 rating does not match the evidence; proof must concern this engagement, opinions without artifacts never approve, and every ask-changes or reject records a reason |
| PRD-F5 | Right of reply (Retired) | Dropped | Retired 2026-10-13: public client replies removed per owner approval; the client channel is the private review/correction path in PRD-F13. ID retained, never reused |
| PRD-F6 | Client record | Must-Have | Signed-in freelancers search for a client and see the client average, contributor count, Limited-record label under five contributors, counts by derived outcome, tag distribution, and the published logs with the filer name; the client sees their own record; expired records are removed; empty states show no score and imply nothing |
| PRD-F7 | Accounts and sign-in | Must-Have | Sign up and sign in as a freelancer or a client; staff accounts get moderator or admin roles; records and logs are sign-in-only |
| PRD-F8 | Onboarding and legal acknowledgment | Must-Have | Every new account reads and accepts the privacy notice, terms, and the awareness-only boundary before using the product; freelancers also acknowledge the proof requirement |
| PRD-F9 | Client registration and engagement handshake | Must-Have | A freelancer creates an engagement and sends an invite link; the client registers (or signs in), consents to being logged, and accepts or declines; refusal is out of scope with no warnings; the client is matched by registered account with moderator identity checks, never auto-merged on names |
| PRD-F10 | Corroboration (Retired) | Dropped | Retired 2026-10-13: same-experience clicks, upvotes, and corroboration counts removed per owner approval; v1 uses independently submitted, moderator-reviewed experiences only. ID retained, never reused |
| PRD-F11 | Email notifications | Should-Have | Email on invite, acceptance, moderation decision, publication, and correction/update decision |
| PRD-F12 | Personal data and retention handling | Must-Have | A user can request an export, correction, or deletion of their account data; the approved retention lifecycle is enforced (drafts, rejected material, published experience plus proof, consent/moderation history, holds, account close); expired records are removed from visible history and rating |
| PRD-F13 | Private review and correction | Must-Have | The named client (or filer for their own update) requests private review at any time the record exists: one open request per log, new evidence for repeats, independent unconflicted moderator with a 48-hour target; requesting alone never hides; credible error/privacy risk may temporarily hide; uphold / ask-changes / correct / withdraw with reasons and history; filer later-dated updates (e.g. paid late) need moderator approval; the client can never directly edit or delete a publication |
| PRD-F14 | Engagement and client ratings | Must-Have | Integer 1-5 rating on every published log with automatic Negative (1-2) / Mixed (3) / Positive (4-5) derivation; client average is the mean of the latest eligible approved published rating per distinct freelancer/client pair, shown from the first contributor with its count |

Priority vocabulary: `Must-Have`, `Should-Have`, `Could-Have`, `Dropped`.
Only Must-Have features are required in the traceability matrix.

### 3.1 Acceptance criteria

**PRD-F1 - Freelancer verification**
- Given a freelancer who has not verified, when they open the verification step, then they must complete a manual live inspection of a supported government ID (PhilID/ePhilID, passport, or driver licence) with a moderator plus at least one portfolio link before continuing. The moderator views the live ID but never collects, uploads, records, or stores any raw ID image or full number at any step, and no ID proof file is attached in the backend.
- Given a submitted verification, then a moderator records only: reviewer, method, inspection result (pass/fail and whether the name on the ID matches the account/profile name), and time, plus the portfolio links.
- Given an approved verification, then the account status becomes verified with the meaning identity checked, never a guarantee of trustworthiness; a rejection records a reason that the freelancer sees.
- No paid SMS step is required for verification; automatic QR/primary-source scan stays deferred until technically proven and is never treated as prohibited forever.

**PRD-F2 - Structured engagement log**
- Given an engagement the client accepted, when the freelancer files a log, then the log carries one integer rating from 1 to 5; the outcome is derived automatically (1-2 Negative, 3 Mixed, 4-5 Positive) and is never entered separately. Tags come only from the fixed set: On-time Payment, Clear Scope, Responsive, Professional, Late Payment, Non-Payment, Unresponsive, Scope Creep. Tags explain nuance: a 4-5 Positive log may still carry a Late Payment tag, and no tag combination overrides the star-derived outcome.
- Given missing rating, covered work period (start/end dates), tags, or facts (minimum 40 characters, maximum 2,000), when submitting, then the form blocks and names each missing field. Amount stays optional: when supplied it is a non-negative integer in centavos with no currency conversion; the period end must not precede the period start. The covered work period records when the work happened and is separate from the filing anchor below; it is required on ongoing-work logs too.
- Each engagement accepts at most one log. A second submission for the same engagement is rejected.
- Eligibility and clock: a log may be filed only for an accepted engagement after completion/termination, or after the first missed agreed payment/milestone date during ongoing work. The initial filing is due within 15 CALENDAR days of that anchor date; the submission timestamp, not the approval date, must be on time (e.g. a 1 April anchor means a 16 April deadline). Engagement evidence validates the anchor date. Moderation delay, repeat non-payment, and later updates never extend or restart the clock, and no extra grace beyond the 15 days exists.
- Record states: a log is draft, pending, ask-changes (returned to the filer for requested corrections), published, hidden (temporarily during correction review for credible error/privacy risk), withdrawn (after an upheld correction), rejected (final decision against publication), or expired (past 12-month retention). Only approved published logs contribute to the record and the average. A first submission that is complete and on time preserves filing eligibility while the filer answers an ask-changes request after the deadline; the resubmission continues the same log and never counts as a new filing or a clock reset.

**PRD-F3 - Mandatory proof upload**
- Given a log draft with no proof, when submitting, then submission is blocked with "Attach at least one proof file", for positive and negative experiences alike. No log publishes without moderator-approved proof.
- Accepted files: JPEG, PNG, WebP, PDF; up to 10 MB each; up to 5 per log. Files are checked by content type signature, not by file name.
- Images are re-encoded on the device before upload, which removes location and camera metadata.
- Given any signed-in user who is not a moderator, the filer, or the named client, when they request a proof file, then the response is 404.

**PRD-F4 - Moderation queue**
- The queue lists open cases oldest first, with type (verification, log, correction request, filer update) and hours waiting.
- A moderator claims a case before deciding; a claimed case is locked to that moderator for 30 minutes.
- Verification decisions are approve or reject; a rejected freelancer may submit a new corrected request, retaining the previous request and decision. Log and filer-update decisions are approve, ask-changes, or reject. Correction decisions are uphold, ask-changes, correct, or withdraw the publication. Approve and reject both require a reason. Every claim, decision, and release is written to an append-only audit trail with its history.
- A moderator cannot decide a case where they are the filer, the client, or have their own engagement with that client; correction reviews go to an independent unconflicted moderator.
- Cases open for more than 36 hours are marked overdue in the queue.

**PRD-F5 - Right of reply (Retired)**
- Retired 2026-10-13 per owner approval. No public reply is offered, stored, or rendered. The client channel is the private review/correction path in PRD-F13. A client cannot edit or delete the log; there is no such control and the server rejects the attempt.

**PRD-F6 - Client record**
- Given a signed-in freelancer, when they search by client name, then matching registered clients are listed with their engagement count. Signed-out visitors see only the landing, sign-in, sign-up, legal, and invite pages; records and logs are never served to unauthenticated requests or crawlers.
- Given a client record, then it shows: the client average (one decimal) with its distinct contributor count, the Limited record label while fewer than five distinct contributors, total published logs, counts for Negative, Mixed, Positive (derived from ratings), each tag with its count, and the published logs newest first with filer name, rating, date, and moderator-approved dated update metadata only. Private requests, counter-proof, reviewer notes, and invalidated historical content are never shown to readers; there is no response thread. The named client sees their own record; contact and ID data are never shown.
- Only approved published logs appear. Hidden, withdrawn, expired, rejected, pending, ask-changes, and draft logs never appear and never contribute to counts or the average.
- With no published experiences in the past 12 months, the record states No published experiences in the past 12 months with no score, no zero stars, and no implied safe or never-reviewed wording. A log published 10 January persists until the following 10 January, then leaves visible history and rating at expiry.
- No rank, leaderboard, endorsement badge, trust score, or best/worst ordering appears anywhere. The only permitted signals are the per-log 1-5 rating and the client average.

**PRD-F7 - Accounts and sign-in**
- A visitor can create an account as a freelancer or a client with an email one-time code, which is the launch sign-in method. Google sign-in is optional when keys are configured, not required for the pilot. Email-code sign-in carries no paid-SMS dependency.
- Moderator and admin roles can only be granted by an admin.
- Signed-out visitors see only the landing page, sign-in, sign-up, legal pages, and the invite landing page. Client records and logs require sign-in.

**PRD-F8 - Onboarding and legal acknowledgment**
- Given a new account, when it signs in for the first time, then it cannot reach any other page until it accepts the current privacy notice and terms.
- Freelancers additionally confirm three statements: logs need proof, FLAG is not legal advice or dispute resolution, and false logs lead to removal and suspension.
- The acceptance is stored with the policy version and time. When the policy version changes, the user is asked again.
- 100 percent of accounts that file a log have a stored acknowledgment for the current version (FLAG-M9).

**PRD-F9 - Client registration and engagement handshake**
- A verified freelancer creates an engagement with a title, the client's name as they know it, and a start date, and gets an invite link that expires after 14 days.
- Opening the link shows who invited them and what accepting means, then sign-up or sign-in as a client.
- A client account has one client profile: display name, individual or business, city, and optional DTI or SEC registration number.
- Accepting records the client's consent text version and time. Declining closes the engagement; the freelancer cannot log it, and no warning or negative signal is shown for the refusal.
- An invite link works once. Reuse, expiry, or a freelancer opening their own link shows an error and changes nothing.
- The client is matched by registered account. A moderator checks disputed duplicates and identity against the engagement evidence, the business website or social page plus location, and the optional registration number; display-name matches alone never auto-merge profiles.

**PRD-F10 - Corroboration (Retired)**
- Retired 2026-10-13 per owner approval. No same-experience control, upvote, or corroboration count is offered, stored, or rendered. Each experience is independently submitted and reviewed.

**PRD-F12 - Personal data and retention handling**
- Given a user requesting export, correction, or deletion of their account data, then an admin resolves it and the request is recorded with its outcome.
- Published experiences plus proofs are kept 12 months after ORIGINAL publication; updates never restart the clock. Expired records are removed from visible history and rating. A withdrawn formerly-published log leaves the public record and rating immediately but inherits the original-publication 12-month deletion deadline; a documented hold delays only the private purge, never visibility. An abandoned unpublished ask-changes log follows the draft 30-day inactivity cleanup, with its case closed as abandoned before purge. An abandoned proposed update to a still-published log purges only the unapproved revision and its proofs after 30 days idle; the active publication keeps its original 12-month deadline. Idle drafts are deleted after 30 days of inactivity; finally rejected material is deleted 30 days after the final decision.
- Moderation, audit, verification, and correction history each expire 12 months from their own actual case close (verification, log, correction, or filer-update decision), independent of whether the account is still active; documented holds for open review or legal obligation excepted, and no hold is unbounded. A current policy acceptance that gates an active account is never purged: it stays while needed to gate that account, and its closure anchor is when the policy ceases to be active or is superseded, at account closure, or when the relevant consented-engagement purpose ends — with a documented hold for relevant open review. Past rows are never held indefinitely merely until the account closes. Account closure is handled within 30 days with an individual privacy assessment: closing deactivates the account and revokes its access, removes contact, credential, portfolio, and ID metadata as the assessment permits, and never cascades automatically from a USER delete into unexpired logs, proofs, or consent/audit rows. The filer name stays in an eligible published record only where the assessment permits lawful retention; where name or content must be erased earlier, the affected record is hidden or withdrawn and the average recalculated — never an anonymous publication and never a blanket refusal of erasure.

**PRD-F13 - Private review and correction**
- Given a published log, when the named client files a private correction request (with counter-proof) at any time the record exists, then one open request per log is allowed; a repeat request needs new evidence.
- Given a correction request, then an independent unconflicted moderator decides with a 48-hour target: uphold, ask-changes, correct, or withdraw the publication, each with a reason kept in the parties-and-moderators-only review history. Readers see at most the resulting moderator-approved dated update metadata, never the request, counter-proof, or notes. Filing the request alone never hides the log; a credible error or privacy risk may temporarily hide it during review. Ordinary opinion disagreement alone is not removal.
- Given a filer who wants to update their own log (e.g. paid late), when they submit a later-dated update, then a moderator must approve the revised content and rating before it shows; the original publication date still anchors retention.
- A client cannot directly edit or delete a publication; there is no such control and the server rejects the attempt.

**PRD-F14 - Engagement and client ratings**
- Given an accepted engagement, when the freelancer files its one log, then the log carries one integer rating from 1 to 5; the outcome derives automatically (1-2 Negative, 3 Mixed, 4-5 Positive). Every positive and negative experience needs proof and human approval.
- Given a client with approved published logs, then the client average is the mean of the latest eligible approved published rating per DISTINCT freelancer/client pair (one contributor, one vote). It is visible from the first approved contributor with the distinct contributor count beside it, and carries the Limited record label while fewer than five distinct contributors.
- Withdrawn, hidden, expired, rejected, pending, ask-changes, and draft logs never contribute. Eligibility is filtered first: only parent logs with status published, an active approved current revision, unexpired and unhidden count, ordered by original `published_at` descending with `ref` ascending as the final tiebreak; then the latest eligible log per DISTINCT freelancer/client pair contributes its current approved rating. A new pending or rejected log never erases that pair's earlier eligible contribution, and a pending or rejected proposed update to a still-published log never changes its active approved rating.
- Filer names are visible to signed-in freelancer readers; contact and ID data are never shown.

**Flow (plain)**
1. Verified freelancer creates an engagement and sends the invite link. 2. Client registers or signs in, then accepts (consent recorded) or declines (out of scope, no signal). 3. Filer submits one log with a 1-5 rating, tags, facts, and proof inside the 15-calendar-day window. 4. Moderator approves, asks-changes, or rejects. 5. Approved logs publish into the client record with the average, counts, and tags. 6. Private correction or filer update on request with moderator decision. 7. Records expire 12 months after original publication.

**Access (plain)**
| Who | May see |
|-----|---------|
| Signed-in freelancer | Client averages, counts, tags, published logs with filer names; own engagements |
| Named client | Their own record and the logs about them; may file a private correction request |
| Filer | Their own drafts, pending logs, proofs they filed |
| Moderator | Moderated proofs, consent and moderation history, and the queue; filer and client data needed to decide cases |
| Admin | Roles, accounts, privacy requests, and case metadata; sees a proof file only when acting under an actual moderator permission or persona, with no blanket proof bypass |
| Signed-out visitor or crawler | Landing, sign-in, sign-up, legal, and invite pages only; never records or logs |

## 4. Explicit exclusions

Carried forward from `IDEA` §4, plus anything cut during requirements.

| Excluded | Why | Revisit when |
|----------|-----|--------------|
| Legal advice, mediation, dispute resolution, payment enforcement | Awareness only per owner scope | Only via change record |
| Collections, takedown demands against clients, blacklists | Turns awareness into enforcement | Only via change record |
| Logs about unregistered clients or clients who refused the engagement; any warning or negative signal for refusal | Consent through the handshake is the premise; refusal is out of scope with no signal | Only via change record |
| Standalone single-entry pages | A log is always shown inside its client record | Only via change record |
| Public replies or public response threads | Defamation exposure; the client channel is private review only | Only via change record |
| Corroboration, same-experience clicks, upvotes, agreement counts | Gameable; each experience is independently submitted and reviewed | Only via change record |
| Unapproved reputation signals: ranks, leaderboards, endorsement or trust badges, any other score | Different liability; invites gaming; only the approved 1-5 rating and client average are permitted | Only via change record |
| Clients browsing or recruiting freelancers; job posts | Not a marketplace | Only via change record |
| Clients logging outcomes about freelancers | Two-sided ratings change the product; see §6 | Only via change record |
| Payments, escrow, invoicing | Out of scope | Only via change record |
| Importing ratings from other platforms | Unverifiable provenance | Only via change record |
| Native mobile apps, external integrations | Pilot is web only | After the pilot |

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

Ideas raised but not accepted. Nothing here may be implemented.

| Candidate | Raised by | Notes |
|-----------|-----------|-------|
| Facebook sign-in | agent, 2026-10-12 | Familiar in PH, but needs Meta app review and may not return an email |
| Clients log outcomes about freelancers | group user flow | Makes FLAG two-sided; excluded in §4 for v1 |
| Paid ID verification vendor (Veriff, Sumsub) | research, 2026-10-12 | About USD 0.80-1.35 per check plus monthly minimums; stores ID images on the vendor side, which conflicts with INV-3 and the approved no-storage manual inspection; not pursued for the pilot |
| Team accounts for a business client | agent, 2026-10-12 | v1 has one account per client profile |
| Collusion alert (positives mostly from freelancers whose only engagements are with this client) | agent, 2026-10-12 | Needs Q7 limits first |
| Messenger in-app browser "Open in Chrome" banner | research, 2026-10-12 | File inputs and storage are unreliable in the Facebook webview |

## 7. Open questions

- Resolved 2026-10-13 (LOG Q9): a log is approved versus rejected by the qualitative moderator rubric defined in PRD-F4 — approve when proof shows the named engagement existed and the claimed outcome is visible or strongly implied; reject or ask-changes when proof lacks an identifiable client, is unverifiable or edited, shows only the filer's side, or the rating does not match the evidence; every rejection records a reason.
- Resolved 2026-10-13 (LOG Q7): per-account and per-client limits on invites and logs are the approved pilot caps recorded in SDD §5 Rate limiting.
- Technical future deferred, not blocking: automatic QR/primary-source ID checking (LOG Q13) stays out of primary requirements until technically proven; pilot verifies by manual live inspection.
