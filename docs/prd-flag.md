---
spine_type: PRD
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

# Product Requirements: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)

---

## 1. Scope statement

FLAG v1 lets verified freelancers open an engagement with a client who registers and accepts it, log the outcome (positive, mixed, or flagged) with fixed tags and mandatory proof, and have every log reviewed by a moderator before signed-in freelancers see it in the client's record, where the client can reply and other freelancers who worked with that client can corroborate. It excludes legal recourse, enforcement, scores and rankings, logs about unregistered parties, hiring or payment features, and public or indexed pages.

## 2. Users

| User | Goal | Priority |
|------|------|----------|
| Freelancer (reader) | Look up a client and read their record before accepting work | Primary |
| Freelancer (filer) | Open an engagement, then log its outcome with proof | Primary |
| Client | Accept engagements, see their own record, reply to logs | Primary |
| Moderator | Decide verifications, logs, replies, and re-review requests against proof within 48 hours | Primary |
| Admin | Manage moderator roles, suspend accounts, handle data requests | Secondary |

## 3. Features

IDs PRD-F1 to PRD-F6 are carried from doc_version 0.1 with the same meaning; PRD-F7 onward are new in 0.2.

| ID | Feature | Priority | Description |
|----|---------|----------|-------------|
| PRD-F1 | Freelancer verification | Must-Have | A freelancer becomes verified after phone OTP, at least one portfolio link, a government ID check that stores no image or full number, and moderator approval |
| PRD-F2 | Structured engagement log | Must-Have | One log per accepted engagement: outcome from Positive, Mixed, Flagged; tags from the fixed set; engagement period; amount; written facts |
| PRD-F3 | Mandatory proof upload | Must-Have | At least one proof file on every log, for every outcome, visible only to the parties and moderators |
| PRD-F4 | Moderation queue | Must-Have | Human review of every verification, log, and reply before it takes effect, with claim, a required reason, and an audit trail |
| PRD-F5 | Right of reply | Must-Have | The named client can post one reply per log, moderated, shown under the log with its date |
| PRD-F6 | Client record | Must-Have | Signed-in freelancers search for a client and see counts by outcome, tag distribution, and the published logs with replies; never a score or rank |
| PRD-F7 | Accounts and sign-in | Must-Have | Sign up and sign in as a freelancer or a client; staff accounts get moderator or admin roles |
| PRD-F8 | Onboarding and legal acknowledgment | Must-Have | Every new account reads and accepts the privacy notice, terms, and the awareness-only boundary before using the product; freelancers also acknowledge the proof requirement |
| PRD-F9 | Client registration and engagement handshake | Must-Have | A freelancer creates an engagement and sends an invite link; the client registers (or signs in), consents to being logged, and accepts or declines |
| PRD-F10 | Corroboration | Must-Have | A verified freelancer who has their own accepted engagement with the same client can mark a published log "same experience"; the count is shown on the log |
| PRD-F11 | Email notifications | Should-Have | Email on invite, acceptance, moderation decision, publication, and reply |
| PRD-F12 | Personal data requests | Should-Have | A user can request an export, correction, or deletion of their account data; admins resolve it and the request is recorded |
| PRD-F13 | Re-review request | Should-Have | A client can ask once per published log for a second moderator review, with a reason; the moderator upholds or withdraws the log |

Priority vocabulary: `Must-Have`, `Should-Have`, `Could-Have`, `Dropped`.
Only Must-Have features are required in the traceability matrix.

### 3.1 Acceptance criteria

**PRD-F1 - Freelancer verification**
- Given a freelancer who has not verified a phone number, when they open the verification step, then they must verify a Philippine mobile number by one-time code before continuing.
- Given a submitted verification, then a moderator sees: phone verified (yes/no), ID check result (pass/fail and whether the name on the ID matches the account name), and the portfolio links. The moderator never sees an ID image.
- Given an ID already linked to another account, when a second account submits it, then the check fails with "This ID is already linked to an account" and the moderator case shows the duplicate.
- Given an approved verification, then the account status becomes verified and the freelancer can create engagements and file logs; a rejection records a reason that the freelancer sees.

**PRD-F2 - Structured engagement log**
- Given an engagement the client accepted, when the freelancer files a log, then the outcome is one of Positive, Mixed, Flagged and tags come only from: On-time Payment, Clear Scope, Responsive, Professional, Late Payment, Non-Payment, Unresponsive, Scope Creep.
- Given a Positive outcome, then at least one positive tag is required and no risk tag is allowed. Given a Flagged outcome, then at least one risk tag is required. Mixed requires at least one of each.
- Given missing period, outcome, tags, or facts (minimum 40 characters, maximum 2,000), when submitting, then the form blocks and names each missing field.
- Each engagement accepts at most one log. A second submission for the same engagement is rejected.

**PRD-F3 - Mandatory proof upload**
- Given a log draft with no proof, when submitting, then submission is blocked with "Attach at least one proof file", for every outcome.
- Accepted files: JPEG, PNG, WebP, PDF; up to 10 MB each; up to 5 per log. Files are checked by content type signature, not by file name.
- Images are re-encoded on the device before upload, which removes location and camera metadata.
- Given any signed-in user who is not a moderator, the filer, or the named client, when they request a proof file, then the response is 404.

**PRD-F4 - Moderation queue**
- The queue lists open cases oldest first, with type (verification, log, reply, re-review) and hours waiting.
- A moderator claims a case before deciding; a claimed case is locked to that moderator for 30 minutes.
- Approve and reject both require a reason. Every claim, decision, and release is written to an append-only audit trail.
- A moderator cannot decide a case where they are the filer, the client, or have their own engagement with that client.
- Cases open for more than 36 hours are marked overdue in the queue.

**PRD-F5 - Right of reply**
- Given a published log about a client, when the client posts a reply (maximum 2,000 characters), then it goes to moderation and, once approved, is shown under the log with the label "Response from client" and its date.
- A client cannot edit or delete the log; there is no such control and the server rejects the attempt.
- The client is notified when a log about them is approved, and can reply within a window of `TBD(owner)` length before and after publication (LOG Q10).

**PRD-F6 - Client record**
- Given a signed-in freelancer, when they search by client name, then matching registered clients are listed with their engagement count.
- Given a client record, then it shows: total published logs, counts for Positive, Mixed, Flagged, a stacked bar of those counts, each tag with its count, and the published logs newest first with their reply and corroboration count.
- With fewer than 5 published logs, the record shows individual logs and the label "Limited record" instead of a stacked bar.
- No score, average, rating, rank, or "best/worst" ordering appears anywhere.

**PRD-F7 - Accounts and sign-in**
- A visitor can create an account as a freelancer or a client with Google sign-in or email with a one-time code.
- Moderator and admin roles can only be granted by an admin.
- Signed-out visitors see only the landing page, sign-in, sign-up, legal pages, and the invite landing page.

**PRD-F8 - Onboarding and legal acknowledgment**
- Given a new account, when it signs in for the first time, then it cannot reach any other page until it accepts the current privacy notice and terms.
- Freelancers additionally confirm three statements: logs need proof, FLAG is not legal advice or dispute resolution, and false logs lead to removal and suspension.
- The acceptance is stored with the policy version and time. When the policy version changes, the user is asked again.
- 100 percent of accounts that file a log have a stored acknowledgment for the current version (FLAG-M9).

**PRD-F9 - Client registration and engagement handshake**
- A verified freelancer creates an engagement with a title, the client's name as they know it, and a start date, and gets an invite link that expires after 14 days.
- Opening the link shows who invited them and what accepting means, then sign-up or sign-in as a client.
- A client account has one client profile: display name, individual or business, city, and optional DTI or SEC registration number.
- Accepting records the client's consent text version and time. Declining closes the engagement; the freelancer cannot log it.
- An invite link works once. Reuse, expiry, or a freelancer opening their own link shows an error and changes nothing.

**PRD-F10 - Corroboration**
- Given a published log and a verified freelancer with their own accepted engagement with the same client, then a "Same experience" control is available on that log.
- One corroboration per freelancer per log. The filer cannot corroborate their own log.
- The log shows the corroboration count; corroborators are not named to the client.

## 4. Explicit exclusions

Carried forward from `IDEA` §4, plus anything cut during requirements.

| Excluded | Why | Revisit when |
|----------|-----|--------------|
| Legal advice, mediation, dispute resolution, payment enforcement | Awareness only per owner scope | Only via change record |
| Collections, takedown demands against clients, blacklists | Turns awareness into enforcement | Only via change record |
| Logs about unregistered clients | Consent through the handshake is the premise | Only via change record |
| Standalone single-entry pages | A log is always shown inside its client record | Only via change record |
| Scores, ratings, ranks, leaderboards, endorsement badges | Different liability; invites gaming | Only via change record |
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
| INV-5 | Compute, store, or render a score, rating, rank, or leaderboard | PRD-F6, PRD-F10 |
| INV-6 | Accept an edit or delete of a published log from a client account | PRD-F5, PRD-F13 |
| INV-7 | Serve a client record or log to an unauthenticated request or to a crawler | PRD-F6, PRD-F7 |
| INV-8 | Accept a log, an engagement, or a corroboration from a freelancer who is not verified or lacks a current onboarding acknowledgment | PRD-F1, PRD-F8, PRD-F9, PRD-F10 |

## 5. Metrics

| ID | Metric | Target | How measured |
|----|--------|--------|--------------|
| FLAG-M1 | Logs from verified accounts | 100 percent of stored logs | Query logs joined to freelancer verification status |
| FLAG-M2 | Proof-attachment rate | 100 percent of submitted logs have at least one proof file | Count logs with no proof row |
| FLAG-M3 | Moderation turnaround | At least 90 percent of cases decided within 48 hours | Case created and decided timestamps, reviewed weekly |
| FLAG-M4 | Reply availability | 100 percent of published logs offer the client a reply path | Count published logs whose client account can reply |
| FLAG-M5 | Pilot participation | 20 to 30 pilot participants during Nov 29 - Dec 12, 2026 | Accounts created during the pilot window |
| FLAG-M6 | Balance health | At least 30 percent of published logs are Positive | Published logs by outcome |
| FLAG-M7 | Corroboration rate | `TBD(owner)` target; an early goal draft said 30 percent of client records (LOG Q11) | Client records with a flagged log that has at least one corroboration |
| FLAG-M8 | Pilot satisfaction | At least 80 percent satisfied in the post-test survey | Survey run by QA |
| FLAG-M9 | Onboarding acknowledgment | 100 percent of filing accounts acknowledged the current policy version | Join logs to acknowledgments |

## 6. Candidates (not decided)

Ideas raised but not accepted. Nothing here may be implemented.

| Candidate | Raised by | Notes |
|-----------|-----------|-------|
| Facebook sign-in | agent, 2026-10-12 | Familiar in PH, but needs Meta app review and may not return an email |
| Show declined invitations on the client record | agent, 2026-10-12 | Strong signal against clients who refuse the handshake; changes what consent means |
| Clients log outcomes about freelancers | group user flow | Makes FLAG two-sided; excluded in §4 for v1 |
| Paid ID verification vendor (Veriff, Sumsub) | research, 2026-10-12 | About USD 0.80-1.35 per check plus monthly minimums; stores ID images on the vendor side |
| Team accounts for a business client | agent, 2026-10-12 | v1 has one account per client profile |
| Collusion alert (positives mostly from freelancers whose only engagements are with this client) | agent, 2026-10-12 | Needs Q7 limits first |
| Messenger in-app browser "Open in Chrome" banner | research, 2026-10-12 | File inputs and storage are unreliable in the Facebook webview |

## 7. Open questions

- `TBD(owner)` What does a freelancer without a PhilID or ePhilID use, given INV-3? (LOG Q8)
- `TBD(owner)` What proof standard approves versus rejects a log? (LOG Q9)
- `TBD(owner)` How long is the client's reply window around publication? (LOG Q10)
- `TBD(owner)` What is the corroboration target for FLAG-M7? (LOG Q11)
- `TBD(owner)` What per-account and per-client limits apply to invites and logs? (LOG Q7)
- `TBD(owner)` What retention applies to proofs, logs, replies, and closed accounts? (LOG Q5)
