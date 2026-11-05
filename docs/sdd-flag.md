---
spine_type: SDD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.46
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-11-05
reconciled: 2026-10-13
---

# System design: FLAG

**Requirements:** [PRD](prd-flag.md). **Delivery state:** [INDEX](index.md#6-current-development-baseline).
This document defines the allowed target contract. Existing source and planned
additions are distinguished below; an entity does not establish implementation.
The owner authorized the remaining approved pilot implementation while docs stay
Review on 2026-11-02 (current LOG §14); human reconciled dates remain unchanged.

## 1. Architecture

Browser -> Next.js App Router -> OpenNext Cloudflare Worker -> D1/Drizzle and
private R2. Better Auth supplies sessions and email OTP; `sendMail` chooses Brevo
when configured, otherwise Resend. Google is optional; no password/SMS flow.
INDEX tracks local implementation separately from deployed capabilities.

Sources: `web/next.config.ts:1`, `web/open-next.config.ts:1`,
`web/wrangler.jsonc:1`, `web/src/server/auth/config.ts:46`,
`web/src/server/mail/index.ts:21`.

## 2. Components

| Component | Responsibility | Serves | Source |
|-----------|----------------|--------|--------|
| Auth and guards | Session, current viewer/role/policies, passwordless restrictions, rate limiting | PRD-F7, PRD-F8 | `web/src/server/auth/config.ts:46`, `web/src/server/auth/guards.ts:11` |
| Onboarding | Role selection and versioned acceptance | PRD-F8 | `web/src/server/db/queries/viewer.ts:39` |
| Verification | Request snapshot and live inspection | PRD-F1 | `web/src/features/verification/submit.ts:5` |
| Moderation | Verification claim/release/inspect/decide | PRD-F4 | `web/src/features/moderation/handlers.ts:6` |
| Engagements | Create, accept, decline, cancel; explicit consent | PRD-F9 | `web/src/features/engagements/handlers.ts:6` |
| Private intake | Draft, proof upload/download and pending submission; guarded writes | PRD-F2, PRD-F3, PRD-F14 | `web/src/features/logs/actions.ts:18` |
| Cleanup | Bounded unsubmitted-draft/orphan handling | PRD-F12 foundation | `web/src/features/logs/cleanup.ts:7` |
| Privacy recognition | Reject recognizable government-ID payloads before writes | PRD-F1, PRD-F2 | `web/src/features/verification/privacy.ts:1`, `web/src/server/auth/privacy.ts:1` |
| Interface | Shared shell, local fonts and civic-record tokens | all | `web/src/app/layout.tsx:1`, `web/src/app/globals.css:1` |

## 3. Data model

**Schema file:** `web/src/server/db/schema.ts`

The ERD contains the 18 baseline tables through migration 0009 plus the pilot
additions identified in §3.2. The `planned` annotations distinguish the pilot
design from that baseline. Local source declarations and forward migrations
0010-0011 now project this contract; independent implementation acceptance and
deployment are separate. This remains the design contract for PRD-F4, PRD-F6,
PRD-F12, PRD-F13 and PRD-F14; use INDEX for delivery state.
Timestamps are ISO-8601 text except rate-limit expiry in Unix milliseconds;
booleans are integer 0/1. Optional fields are marked nullable.

New fields/entities/relationships require this completed ERD before code or
migration. Sections 3.8–3.12 define the associated write/read protocols. Existing
SQL/history remains unchanged until a separate additive implementation.

### 3.1 Entity-relationship diagram

```mermaid
erDiagram
    USER ||--o{ SESSION : has
    USER ||--o{ ACCOUNT : links
    USER ||--o{ POLICY_ACCEPTANCE : accepts
    USER ||--o| FREELANCER_PROFILE : "is"
    USER ||--o| CLIENT_PROFILE : "is"
    USER |o--o{ AUDIT_EVENT : performs
    USER |o--o{ VERIFICATION_CASE : inspects
    USER ||--o{ LOG_REVISION : submits
    USER ||--o{ PROOF_FILE : uploads
    USER |o--o{ MODERATION_CASE : decides
    USER |o--o{ MODERATION_CASE : verification_subject
    FREELANCER_PROFILE ||--o{ VERIFICATION_CASE : undergoes
    FREELANCER_PROFILE ||--o{ PORTFOLIO_LINK : lists
    FREELANCER_PROFILE ||--o{ ENGAGEMENT : opens
    CLIENT_PROFILE |o--o{ ENGAGEMENT : accepts
    ENGAGEMENT ||--o| ENGAGEMENT_CONSENT : "has explicit receipt"
    POLICY_ACCEPTANCE ||--o| ENGAGEMENT_CONSENT : "evidences one engagement"
    ENGAGEMENT ||--o| ENGAGEMENT_LOG : "is logged by"
    ENGAGEMENT_LOG ||--o{ LOG_REVISION : versions
    LOG_REVISION ||--o{ LOG_TAG : carries
    LOG_REVISION |o--o{ PROOF_FILE : binds
    ENGAGEMENT_LOG |o--o{ MODERATION_CASE : "planned log_id"
    MODERATION_CASE ||--o{ REVIEW_ROUND : "planned rounds"
    MODERATION_CASE |o--o{ LOG_REVISION : "planned proposal rounds"
    LOG_REVISION |o--o{ REVIEW_ROUND : "planned reviewed revision"
    USER ||--o{ REVIEW_ROUND : "planned human reviewer"
    REVIEW_ROUND ||--o{ PROOF_REVIEW : "planned checks"
    PROOF_FILE |o--o{ PROOF_REVIEW : "planned reviewed bytes"
    ENGAGEMENT_LOG |o--o{ CORRECTION_REQUEST : "planned live private requests"
    USER ||--o{ CORRECTION_REQUEST : "planned named requester"
    CORRECTION_REQUEST |o--o{ PROOF_FILE : "planned counterproof owner"
    CORRECTION_REQUEST |o--o{ MODERATION_CASE : "planned correction_id"
    LOG_REVISION |o--o{ CORRECTION_REQUEST : "planned challenged revision"
    LOG_REVISION ||--o{ REVISION_PROOF : "planned evidence set"
    PROOF_FILE ||--o{ REVISION_PROOF : "planned may support revisions"
    USER |o--o{ PRIVACY_REQUEST : "planned subject"
    USER |o--o{ PRIVACY_REQUEST : "planned responsible staff"
    PRIVACY_REQUEST |o--o{ MAINTENANCE_TASK : "planned assessed actions"
    PRIVACY_REQUEST ||--o{ EXPORT_DELIVERY : "planned scoped export"
    PRIVACY_REQUEST |o--o{ BACKUP_DISPOSITION : "planned backup handling"
    USER ||--o{ RETENTION_HOLD : "planned responsible staff"
    USER |o--o{ CORRECTION_REQUEST : "planned temporary hide reviewer"
    USER |o--o{ MAINTENANCE_TASK : "planned authorizer"
    MODERATION_CASE |o--o{ AUDIT_EVENT : "planned case clock"

    USER {
        text id PK
        text name
        text email UK
        integer email_verified
        text image "nullable"
        text role "nullable until chosen at onboarding; freelancer | client | moderator | admin"
        integer banned
        text ban_reason "nullable"
        text phone_number UK "nullable, existing column, unused by pilot verification"
        integer phone_number_verified
        text created_at
        text updated_at
        text deactivated_at "planned nullable; deny every session and sign-in"
    }
    SESSION {
        text id PK
        text user_id FK
        text token UK
        text expires_at
        text ip_address "nullable"
        text user_agent "nullable"
        text created_at
        text updated_at
    }
    ACCOUNT {
        text id PK
        text user_id FK
        text provider_id "google | credential"
        text account_id
        text access_token "nullable, secret"
        text refresh_token "nullable, secret"
        text id_token "nullable, secret"
        text access_token_expires_at "nullable"
        text refresh_token_expires_at "nullable"
        text password "nullable, always null; Better Auth core column, no password sign-in"
        text scope "nullable"
        text created_at
        text updated_at
    }
    AUTH_VERIFICATION {
        text id PK
        text identifier
        text value "one-time code, hashed"
        text expires_at
        text created_at
        text updated_at
    }
    CURRENT_POLICY_VERSION {
        text policy PK "privacy | terms | freelancer_ack | client_consent"
        text version "application authority; change only through reviewed forward migration"
    }
    POLICY_ACCEPTANCE {
        text id PK
        text user_id FK
        text policy "privacy | terms | freelancer_ack | client_consent"
        text version
        text accepted_at
        text retired_at "planned nullable; actual policy or purpose end"
    }
    AUTH_RATE_LIMIT {
        text key PK "HMAC auth key | private-upload account/day | log-reference-sequence"
        integer count "positive request count or permanent reference highwater"
        integer expires_at "Unix ms bucket expiry; highwater uses 9007199254740991"
    }
    FREELANCER_PROFILE {
        text user_id PK, FK
        text display_name
        text city "nullable"
        text status "unverified | pending | verified | rejected | suspended"
        text verified_at "nullable"
        text created_at
    }
    VERIFICATION_CASE {
        text id PK
        text freelancer_id FK
        text submitted_profile "nullable for legacy requests; immutable JSON name/city/portfolioLinks snapshot for new requests"
        text reviewer_id FK "nullable until live inspection; inspecting moderator"
        text method "live_manual"
        text id_kind "nullable until inspection; philid | ephilid | passport | drivers_licence"
        text result "nullable until inspection; pass | fail"
        integer name_match "nullable until inspection; 0 | 1"
        text inspected_at "nullable until inspection; no default"
        text decision "nullable, approve | reject"
        text reason "nullable"
        text decided_at "nullable"
        text created_at
    }
    PORTFOLIO_LINK {
        text id PK
        text freelancer_id FK
        text url
        text label "nullable"
    }
    CLIENT_PROFILE {
        text id PK
        text user_id FK, UK
        text display_name
        text kind "individual | business"
        text city "nullable"
        text registration_no "nullable, DTI or SEC"
        text created_at
    }
    ENGAGEMENT {
        text id PK
        text freelancer_id FK
        text client_id FK "nullable until accepted"
        text title
        text client_name_hint
        text started_on
        text ended_at "nullable, completion or termination date"
        text status "invited | accepted | declined | expired | cancelled"
        text invite_token_hash UK
        text invite_expires_at
        text accepted_at "nullable"
        text declined_at "nullable"
        text purpose_ended_at "planned nullable; actual association/consent purpose end, not work end"
        text created_at
    }
    ENGAGEMENT_CONSENT {
        text engagement_id PK, FK
        text policy_acceptance_id FK, UK
    }
    ENGAGEMENT_LOG {
        text id PK
        text ref UK "human reference, e.g. FL-1042, monotonic for tiebreaks"
        text engagement_id FK, UK
        text freelancer_id FK
        text client_id FK
        text current_revision_id FK "nullable until first approval"
        text status "draft | pending | ask_changes | published | hidden | withdrawn | rejected | expired"
        text anchor_kind "completed | terminated | missed_milestone"
        text anchor_date "event date the 15-day clock runs from"
        text draft_updated_at "nullable legacy fallback created_at; latest save, upload or accepted explicit proof removal"
        text first_submitted_at "nullable, immutable once set"
        text submitted_at "nullable, latest submission"
        text published_at "nullable, original publication, immutable"
        text expires_at "nullable, original publication plus 12 months"
        text hold_kind "nullable, review | legal"
        text hold_placed_at "nullable"
        text hold_released_at "nullable"
        text name_retention_until "planned nullable; assessed lawful filer-name deadline"
        text created_at
    }
    LOG_REVISION {
        text id PK
        text log_id FK
        integer rev_no "1, 2, 3, immutable per log"
        text kind "initial | filer_update | correction"
        integer rating "1 to 5"
        text outcome "negative | mixed | positive, derived from rating"
        text facts
        text period_start "covered work start date, required; separate from the filing anchor"
        text period_end "covered work end date, required, >= period_start"
        integer amount_centavos "nullable, optional, >= 0 when supplied; no currency conversion"
        text submitted_by FK
        text submitted_at
        text decided_by FK "nullable"
        text decided_at "nullable"
        text decision "nullable, approve | ask_changes | reject | correct | withdraw | uphold"
        text reason "nullable"
        text draft_updated_at "planned nullable; proposed-revision inactivity"
        text effective_on "planned nullable; later-dated filer update"
        text invalidated_at "planned nullable; correction/privacy suppression, not a content edit"
        text state "planned draft | submitted; legacy initial submissions map from parent"
        text moderation_case_id FK "planned nullable; stable case across revised proposal rounds"
    }
    LOG_TAG {
        text revision_id PK, FK
        text tag PK "fixed set of eight"
    }
    PROOF_FILE {
        text id PK
        text log_id FK
        text revision_id FK "nullable until bound on submit"
        text owner_kind "filer | client"
        text uploaded_by FK
        text object_key UK "R2 key"
        text kind "screenshot | invoice | agreement | chat | other"
        text mime "image/jpeg | image/png | image/webp | application/pdf"
        integer size_bytes
        text sha256
        integer purge_attempts "default 0; durable cleanup retry ordering"
        integer purge_inflight "default 0; exclusive pending-purge owner, 0 or 1"
        integer write_inflight "default 0 for legacy; 1 while the unique reservation's PUT is unsettled"
        text status "uploading | attached | abandoned | pending_purge | purged"
        text uploaded_at
        text correction_request_id FK "planned nullable; counterproof belongs to one private request"
    }
    MODERATION_CASE {
        text id PK
        text kind "verification | log | correction | filer_update"
        text subject_id "id of the row under review; UNIQUE with kind"
        text verification_subject_user_id FK "nullable; immutable exact verification owner, unknown legacy stays null"
        text status "open | claimed | decided; planned adds awaiting_changes | closed"
        text claimed_by FK "nullable"
        text claimed_until "nullable"
        text decision "nullable, approve | ask_changes | reject | uphold | correct | withdraw"
        text reason "nullable"
        text decided_by FK "nullable"
        text decided_at "nullable"
        text created_at
        text log_id FK "planned nullable; same-log guard for log, correction, update cases"
        text correction_request_id FK "planned nullable; correction cases only, unique"
        text closed_at "planned nullable; actual terminal close, never ask_changes"
        text closure_kind "planned nullable; decision | abandoned | erased"
    }
    AUDIT_EVENT {
        text id PK
        text actor_id FK "nullable for system events"
        text action
        text subject_type
        text subject_id
        text created_at
        text moderation_case_id FK "planned nullable; retained case anchor"
        text retain_until "planned nullable; actual standalone-purpose close plus 12 months"
    }
    REVIEW_ROUND {
        text id PK
        text case_id FK
        integer round_no "unique per case; starts at one"
        text revision_id FK "nullable for verification or after assessed content purge"
        text reviewer_id FK
        text decision "approve | ask_changes | reject | uphold | correct | withdraw"
        text reason "private nonempty reason"
        text decided_at
    }
    PROOF_REVIEW {
        text id PK "stable receipt identity through proof purge"
        text round_id FK
        text proof_id FK "nullable only after assessed proof purge"
        text proof_sha256 "exact byte identity, no government-ID derived hash"
        text verdict "accepted | rejected"
        text reason "nonempty private reason"
        text reviewed_at
    }
    REVISION_PROOF {
        text revision_id PK, FK
        text proof_id PK, FK
    }
    CORRECTION_REQUEST {
        text id PK
        text log_id FK "nullable only after assessed content purge"
        text subject_ref "immutable content-free original log ID; survives parent purge"
        text requested_by FK
        text base_revision_id FK "nullable after assessed content purge"
        text status "draft | submitted | ask_changes | closed | abandoned"
        text new_evidence_note "private; original submitted note immutable including ask_changes"
        text active_proof_ids "planned JSON array default []; unique same-request named-client proof IDs, maximum five"
        text created_at
        text updated_at
        text submitted_at "nullable until complete submission"
        text closed_at "nullable until terminal close"
        text hidden_at "nullable; credible risk, never automatic on request"
        text hidden_by FK "nullable; unconflicted moderator"
        text hide_reason "nullable; private factual/privacy basis"
        text restored_at "nullable; justified decision and live eligibility recheck"
    }
    PRIVACY_REQUEST {
        text id PK
        text subject_user_id FK "nullable after final user erasure"
        text responsible_id FK "nullable until assigned; current admin/privacy processor"
        text kind "export | correction | deletion | closure"
        text received_at
        text due_at "closure assessment no later than received_at plus 30 days"
        text identity_verified_at "nullable; no raw ID collection"
        text status "received | assessing | executing | completed | deferred | denied"
        text scope "private structured target IDs and requested data classes"
        text assessment "nullable private per-category disposition, basis and deadlines"
        text outcome "nullable private reason and completed/deferred actions"
        text deactivated_at "nullable; access revocation confirmation"
        text assessed_at "nullable"
        text closed_at "nullable; actual processing outcome date"
    }
    RETENTION_HOLD {
        text id PK
        text target_type "log | revision | proof | case | policy | request=privacy_request | audit | user; exact object only"
        text target_id "polymorphic exact scope, checked by handler"
        text kind "review | legal"
        text responsible_id FK
        text reason "private documented basis; no blanket account hold"
        text placed_at
        text review_due_at
        text expires_at "finite assessed end; renewal is a new row"
        text released_at "nullable"
    }
    MAINTENANCE_TASK {
        text id PK
        text privacy_request_id FK "nullable for scheduled retention"
        text authorized_by FK "nullable for server-derived scheduled retention"
        text target_type "allowlisted entity name"
        text target_id
        text operation "purge | redact_identity | retire_policy | close_abandoned"
        text basis "retention_due | assessed_erasure | account_closure"
        text due_at
        text authorized_at
        text authorization_expires_at
        text status "planned | claimed | blocked | completed | abandoned"
        text claimed_at "nullable; no timer-based takeover"
        integer attempts "durable nonnegative retry count"
        text completed_at "nullable"
        text retain_until "own actual close plus 12 months; no submitted content"
    }
    EXPORT_DELIVERY {
        text id PK
        text privacy_request_id FK
        text auth_kind "session | assessed_capability; scoped export identity only"
        text object_key UK "nullable after private export purge"
        text token_hash UK "nullable after revoke; never plaintext token"
        int write_inflight "0 or 1; unique preparing invocation owns unsettled PUT"
        text created_at
        text expires_at
        text downloaded_at "nullable; single-use delivery"
        text purged_at "nullable; confirm R2 deletion"
    }
    BACKUP_DISPOSITION {
        text id PK
        text privacy_request_id FK "nullable for scheduled retention"
        text target_type
        text target_id
        text backup_ref "content-free named backup/location identifier, no credentials"
        text action "erase | expire | restore_filter"
        text basis "private assessment of retained copy"
        text due_at "finite deadline"
        text status "pending | verified"
        text verified_at "nullable until actual evidence"
    }

```

AUTH_VERIFICATION is Better Auth's email-keyed code model, not a freelancer
case. MODERATION_CASE.subject_id is polymorphic, checked by kind-specific
handlers rather than a foreign key. The schema has no content-bearing audit
column. Source anchors: `web/src/server/db/schema.ts:17`, `:77`, `:188`, `:209`.

### 3.2 Entity register


| Entity | Serves | Constrained by | Data class | Retention | Notes |
|--------|--------|----------------|------------|-----------|-------|
| USER | PRD-F7, PRD-F12 | INV-8 | PII | Assessed lifecycle, then remove/scrub identifying fields | Planned deactivated_at denies all access; IDs may remain only for assessed finite evidence purpose |
| SESSION | PRD-F7 | INV-7 | secret | 14-day session expiry; revoke on logout/closure | Better Auth; tokens and optional IP/user-agent |
| ACCOUNT | PRD-F7 | - | secret | Assessed account lifecycle | OAuth columns; password always NULL under auth hooks |
| AUTH_VERIFICATION | PRD-F7, PRD-F12 | - | secret | 10-minute OTP validity; physical purge due at expires_at on the next bounded hourly sweep | Typed email identifier and hashed code; independent of freelancer verification |
| AUTH_RATE_LIMIT | PRD-F7, PRD-F2, PRD-F3 | INV-2 | internal | Expiring buckets; permanent reference high-water survives | HMAC auth keys, private-upload counters, log-reference-sequence |
| CURRENT_POLICY_VERSION | PRD-F8, PRD-F9 | INV-8 | internal | Current application authority; no personal data | Planned; four allowlisted policy/version rows, immutable ordinary DML; forward migration changes version with source |
| POLICY_ACCEPTANCE | PRD-F8, PRD-F9, PRD-F12 | INV-8 | internal | Current needed gates; retired_at plus 12 months, subject to assessed erasure/holds | Planned retired_at changes only through scoped maintenance |
| FREELANCER_PROFILE | PRD-F1 | INV-3, INV-8 | PII | Assessed account lifecycle | Identity status, no ID image/number/hash |
| VERIFICATION_CASE | PRD-F1, PRD-F12 | INV-3 | PII | 12 months after corresponding moderation case closed_at | Immutable submitted snapshot/decision; assessed earlier redaction uses maintenance |
| PORTFOLIO_LINK | PRD-F1 | INV-3 | PII | Assessed account lifecycle | Validated URL and optional label |
| CLIENT_PROFILE | PRD-F9, PRD-F6 | INV-6 | PII | Assessed account lifecycle | One per client user, no name-based merging |
| ENGAGEMENT | PRD-F9, PRD-F12 | INV-2 | internal | Linked purpose and assessed lifecycle | Planned purpose_ended_at records actual association purpose end, separate from work end |
| ENGAGEMENT_CONSENT | PRD-F9, PRD-F8 | INV-2 | internal | With consent purpose, then PRD-F12 retired-purpose period/holds | One fresh acceptance per engagement; ordinary deletes forbidden |
| ENGAGEMENT_LOG | PRD-F2, PRD-F6, PRD-F12, PRD-F14 | INV-1, INV-2, INV-5, INV-6 | PII | Original-publication 12 months; idle draft 30 days; unpublished rejection 30 days after final decision | Planned name_retention_until; no anonymous publication after assessed name erasure |
| LOG_REVISION | PRD-F2, PRD-F4, PRD-F13, PRD-F14 | INV-1, INV-6 | PII | Parent deadline; unpublished abandonment 30 days inactive, rejected proposal 30 days after final decision | Planned state/activity/effective date/invalidation; prior content remains private |
| LOG_TAG | PRD-F2, PRD-F6 | - | internal | With revision | Fixed eight tags |
| PROOF_FILE | PRD-F3, PRD-F12 | INV-2, INV-4 | PII | With parent; unsubmitted cleanup implemented | Private R2 bytes; immutable size/hash/MIME and retry metadata |
| MODERATION_CASE | PRD-F1, PRD-F4, PRD-F12, PRD-F13 | INV-1, INV-3 | PII | 12 months after own actual closed_at, or assessed earlier purge/independent holds | Minimal immutable verification_subject_user_id preserves exact ownership after request erasure; no copied profile/inspection content or new clock; ask-changes is not closure |
| AUDIT_EVENT | PRD-F4, PRD-F12 | INV-3 | internal | Case close plus 12 months; standalone completed-purpose retain_until | Planned case FK/deadline; no content column |
| REVIEW_ROUND | PRD-F4, PRD-F13, PRD-F12 | INV-1, INV-6 | PII | Minimal private history until case closed_at plus 12 months | Planned; immutable decision/reason and actual reviewer; not public content |
| PROOF_REVIEW | PRD-F3, PRD-F4, PRD-F12 | INV-1, INV-4 | internal | With round; detach proof pointer when bytes/content expire sooner | Planned; per-round exact-byte verdict; no file content |
| REVISION_PROOF | PRD-F3, PRD-F13 | INV-2, INV-4 | internal | With referenced revision/proof, delete before either | Planned; reuses eligible proof without rewriting its original binding |
| CORRECTION_REQUEST | PRD-F13, PRD-F12 | INV-4, INV-6 | PII | Minimal request/reason history: actual close plus 12 months; counterproof bytes at parent deadline | Planned; immutable content-free subject_ref survives assessed live log_id/base_revision_id detachment; abandoned drafts 30 days inactive |
| PRIVACY_REQUEST | PRD-F12 | INV-3, INV-4 | PII | Own actual close plus 12 months; assessed earlier erasure/holds | Planned; identity check, responsible staff, category assessment/outcome |
| RETENTION_HOLD | PRD-F12, PRD-F13 | INV-4 | PII | Active finite end; released/expired minimal receipt 12 months from actual end | Planned; private reason and explicit scope, never extends publication |
| MAINTENANCE_TASK | PRD-F12 | INV-3, INV-4, INV-6 | internal | Actual completed/abandoned purpose plus 12 months; unresolved tasks visibly blocked | Planned; scoped server authorization and idempotent erasure receipts |
| EXPORT_DELIVERY | PRD-F12 | INV-4 | secret | Private artifact/token maximum 24 hours; minimal receipt with request history | Planned; authenticated, one-use delivery; purge bytes at expiry |
| BACKUP_DISPOSITION | PRD-F12 | INV-3, INV-4 | internal | Pending until assessed copy expiry/erasure; minimal receipt 12 months after verification | Planned; finite due_at and restore suppression; no backup content |

Retention in this register is the approved policy, not a claim that full
maintenance exists. PRD-F12 owns exact deadlines, exceptions and assessment.

### 3.3 Constraints and indexes

Source: `web/src/server/db/schema.ts:154`, `:188`, `:259`, `:304`, `:339`, `:394`;
backstops in `web/drizzle/0006_verification_review.sql:1`,
`web/drizzle/0007_verification_submitted_profile.sql:1`,
`web/drizzle/0008_engagement_consent.sql:1` and
`web/drizzle/0009_private_log_intake.sql:1`.

| Contract | Enforcement | Serves |
|----------|-------------|--------|
| One undecided verification per freelancer; complete-or-empty inspection tuple; passing matched inspection for approval; reasoned immutable decision | Partial unique index, CHECKs and verification triggers | PRD-F1, INV-3, INV-8 |
| Immutable submitted name/city/portfolio snapshot; legacy NULL stays unknown | 0007 migration and request/history readers | PRD-F1 |
| Verification history retains exact subject authority after request deletion | MODERATION_CASE.verification_subject_user_id references USER with RESTRICT, indexed by subject; new verification case INSERT must match its exact verification request owner; all updates to that field forbidden | PRD-F1, PRD-F12, INV-3 |
| One review per kind/subject; valid open/claimed/decided tuple and kind-specific outcomes | Unique index, CHECKs, compare-and-set handlers | PRD-F4 |
| Server-owned audit actor/action, no submitted content; ordinary audit and decided-row edits/deletes forbidden | Handlers and freeze triggers | PRD-F4, INV-3 |
| Client profile unique by user; invited initial state; one fresh consent acceptance per engagement; accepted parties/time frozen | Profile uniqueness, consent PK/UK/FKs, 0008 triggers | PRD-F9, INV-2 |
| Log parties match its accepted engagement; current revision and bound proofs belong to the same log | Composite FKs with RESTRICT | PRD-F2, INV-2 |
| One log per engagement and unique stable human reference | Unique indexes; reference high-water protocol | PRD-F2 |
| Integer 1-5 rating; derived outcome; fixed tags; real ordered dates; optional nonnegative integer centavos | Handler schemas and CHECKs | PRD-F2, PRD-F14, INV-5 |
| Pending requires accepted engagement, verified/acknowledged filer, complete initial revision/tags, 1-5 attached proofs, open log case, filing window and quotas | Conditional D1 batch and 0009 trigger | INV-2, INV-8 |
| Submitted log/revision/tag/proof content frozen; initial intake cannot publish | 0009 transition/freeze triggers | INV-1, INV-6 |
| Byte size, MIME and checksum are immutable metadata; generated R2 key unique; cleanup attempts/inflight bounded integers | Schema, storage checks and 0009 triggers | PRD-F3, INV-4 |

Existing USER cascades on sessions/accounts/policy acceptance/profiles are not a
safe account-erasure mechanism. Existing append-only/freeze triggers do not yet
support the assessed full lifecycle. Do not delete USER to simulate closure or
remove a guard to make a purge pass. Design controlled maintenance first.

The following constraints define the pilot target projected by local migrations
0010-0011; delivery and acceptance remain in INDEX. All new FKs default to
RESTRICT. Nullable review/evidence/user pointers may be detached
only by the scoped retention protocol, with the minimal case receipt retained.

| Target constraint/index | Enforcement contract | Serves |
|-------------------------|----------------------|--------|
| One case per kind/subject remains; one round number per case | Keep existing case unique key; UNIQUE(case_id, round_no). Log subject=log ID, filer_update subject=first proposal revision ID (stable through rounds), correction subject=request ID; typed log/request FKs and revision moderation_case_id consistency | PRD-F4, PRD-F13 |
| At most one undecided initial/update proposal and one open correction per log | Partial unique initial/update case indexes and CORRECTION_REQUEST(log_id) WHERE status IN ('draft','submitted','ask_changes'); terminal rounds immutable | PRD-F13 |
| Case terminal tuple | decided requires decision/reason/decider/decided_at and closed_at=decided_at, closure_kind=decision; abandoned/erased uses closed status, closed_at and closure_kind with no fabricated human decision; awaiting_changes has no final decision or lease | PRD-F4, PRD-F12 |
| Round, revision and proof ownership | Round revision and case share log; correction requester is that log's client; counterproof owner_kind=client/uploaded_by=named client; same-log checks for REVISION_PROOF and proof/correction links. New correction requires live log_id, subject_ref=log_id and named-client requester; subject_ref/requester never change. Only a terminal correction may detach log_id/base_revision_id under the exact parent/revision purge task; detached rows cannot reopen or accept evidence | PRD-F13, INV-4, INV-6 |
| Immutable reviewed bytes and one verdict per proof per round | UNIQUE(round_id, proof_id) for non-NULL proof IDs; stable receipt PK after purge; SHA matches stored proof metadata; verdict time <= round decision; reviewer is round decider; no post-decision proof-set changes | INV-1, INV-2 |
| Revision and publication coherence | UNIQUE(log_id, rev_no), monotonically allocated under CAS; current pointer is same-log approved/correct revision, invalidated_at NULL; immutable original published_at/expires_at and original anchor/first submission; no accepted request can point to pending/invalidated revision | PRD-F2, PRD-F13, PRD-F14 |
| Bounded holds | CHECK placed_at <= review_due_at <= expires_at, finite valid times, released_at >= placed_at; exact target existence checks; index(target_type,target_id,expires_at); no hold placement after purge claim. Only log inherits to its own revisions/proofs. All other target types hold only the exact object; issue separate exact-target rows for assessed dependent categories | PRD-F12 |
| Responsible processing and closure deadline | Closure due_at <= received_at+30 days; assessment/outcome required with assigned current processor and identity verification before terminal handling; terminal rows frozen, deferred work has finite task/backup deadlines | PRD-F12 |
| Maintenance target and grant | Exact allowlisted target/operation/basis; planned->claimed->completed/blocked; expired planned/blocked may become abandoned, never a claimed task; no duplicate live task for same target/operation; time-limited authorization; all destructive SQL checks exact claimed task and due/assessment/no-hold predicates | PRD-F12, INV-6 |
| Physical erasure ordering | Proof metadata cannot disappear until confirmed R2 deletion; revision-proof joins and nullable review pointers removed before proof/revision; no parent purge while any live proof/hold/dependent retained purpose remains | PRD-F12, INV-4 |
| Retention selectors | Index case closed_at, request status/due_at, policy retired_at, revision draft_updated_at, task status/due_at/attempts and backup status/due_at; publication reads always filter expiry, independent of Cron | PRD-F12, PRD-F14 |
| Export delivery | Single unexpired delivery per request; token stored hashed, >=128 random bits; verified subject session or separately assessed export-only capability, never a closed-account app session; proof recipient relationship checked per file; expiration <= created_at+24h | PRD-F12, INV-4 |

Current-policy guards join CURRENT_POLICY_VERSION to acceptance rows instead of
embedding notice dates in triggers. Its four policy keys use the existing
allowlist; no application CRUD exists. Every version bump requires a reviewed
forward migration that transactionally replaces its ordinary-write freeze
triggers, changes the exact authority row and restores those freezes, together
with the matching application policy versions. It never rewrites acceptances.

Expired planned/blocked maintenance grants may be abandoned with their original
grant/attempt/claim fields frozen and actual terminal completed_at plus a clamped
12-month retain_until receipt. A claimed owner cannot be abandoned or stolen.
A new task independently revalidates current scope and staff; an abandoned
receipt never authorizes mutation or proves execution. Privacy completion
requires a completed same-request/target/operation/basis/deadline receipt for
every assessed required action, including a matching successor for every
abandoned required action, plus verified storage/backup disposition. An action
that was never issued cannot be inferred complete from an empty task list.

Correction counterproof selection is CORRECTION_REQUEST.active_proof_ids: a
validated JSON array of at most five unique IDs belonging to the same request
and named client. Only draft/ask_changes may select uploading/attached files;
submitted/claimed/closed selection is frozen. A complete submission has 1-5
selected attached proofs; review candidates and exact receipts use that set.
New reservation plus selected-ID append is one rollback-safe D1 batch. A new
selection never deletes/rebinds deselected bytes or historical receipts. The
original submitted new_evidence_note stays frozen through ask_changes; a
replacement active set can introduce new evidence even at the five-file cap.

Deferred privacy outcomes retain their immutable assessment, finite deadlines,
actual outcome and close clock. Previously verified exact finite actions may
continue on executing/deferred requests under current responsible admin/policy
and grant rechecks; denied/completed requests cannot issue new work. No scope
expansion or perpetual grant is permitted. A later overall resolution uses a new
same-subject request with validated scope.priorRequestId referencing the deferred
receipt; assessment/outcome explicitly reference prior completed tasks rather
than claim duplicate execution. The follow-up has its own responsible processor
and deadline, and neither receipt proves erasure until required copy handling
is verified. Executing scope/assessment and subject identity are frozen.

### 3.4 Migration policy

Published migrations 0000-0008 are immutable. 0009 is an additive source
migration; source presence does not mean it has run remotely. Apply reviewed
pending migrations to the intended backed-up environment before enabling code
that requires them. No deployment command applies SQL automatically.

Generation metadata includes separate 0008 consent, 0009 intake, 0010 pilot
schema and 0011 guard snapshots. Unchanged source schema must yield no generated
SQL; the next source migration number is 0012. Added journal timestamps record local metadata generation, not
historical migration application. Preserve published SQL and prior snapshots;
handwritten triggers remain verified through SQL/migration tests because Drizzle
snapshots do not represent them.

The target additions above must land in forward migrations starting at 0010.
Lifecycle and its guarded maintenance path precede publication-trigger changes;
0009 deliberately blocks publication; 0011 replaces that freeze with exact
lifecycle and human-review guards. Rebuilds needed for FK/CHECK changes
must copy existing values losslessly, preserve IDs, references, consent and
decisions, and pass foreign_key_check against the full 0000-onward chain.
Legacy closed verification cases may use their stored terminal decided_at as
actual closed_at; no invented case dates, proof-review verdicts or consent
receipts. Legacy draft/submitted revision state comes only from its stored
parent. Backfill REVISION_PROOF only from existing same-log proof bindings.
During migration-before-deploy, existing verification handlers may omit the new
close fields. Compatible triggers derive closed_at=decided_at and
closure_kind=decision only for an actual terminal verification transition;
retain the existing verification inspection/decision guards. This compatibility
never invents a review round or permits omitted close fields for new log paths.
Existing unbounded hold tuples must be assessed into bounded hold rows before
real intake; while unresolved they block erasure and readiness, never silently
expire. Keep their historical columns until a later reviewed migration; new
writes use RETENTION_HOLD and cleanup checks both representations during rollout.

### 3.5 Verification request and shared review contract

`submitVerification` captures validated name/city/portfolio once, creates the
request and one open verification case atomically, and sets profile pending.
Only one undecided request exists. Live inspection records the actual reviewer,
method, supported ID type, result, name match and time. No ID photo, number, QR
body/hash or phone-code input is accepted. Auth profile hooks apply compatible
privacy validation; provider image values are discarded.

Portfolio URL validation rejects recognizable government-labelled numbers in
normalized, bounded-decoded original/canonical hostnames, query pairs, paths and
fragments, including composed
labels such as `sss_account_number`, `tin_identification_number` and
`social_security_system_account_number`. Ordinary numeric project identifiers
remain valid. Label context is limited to a query key and its own value; separate
query parameters are never concatenated to manufacture a label or full number.
Original hostnames are inspected before URL punycode conversion can hide Unicode
digits; authority extraction follows URL control-whitespace and special-scheme
slash/backslash boundaries (`web/src/features/verification/privacy.ts:93`).
Decoding remains bounded and fails closed at the limit. Rejected first/corrected
submissions cause no persistence or content logging. Existing stored history is
not rewritten by this validation repair. Source:
`web/src/features/verification/privacy.ts:29`.

Claim/reclaim uses a 30-minute lease, with release and decisions audited. A new
reviewer must reinspect rather than adopt predecessor evidence. The same reviewer
may reuse their passing inspection after release or expiry and reclaim; approval
still requires the current matching lease. Every mutation
rechecks current role, ban, policies, conflict, case status and lease in its D1
boundary. Approve/reject with nonempty reason closes request and case together;
approval additionally requires pass/name-match and updates the profile.

A rejected freelancer submits a corrected new request. Old submitted snapshots
and decisions remain frozen; current profile edits never rewrite them. Legacy
NULL snapshots are shown as unavailable, never reconstructed. Generic future
review kinds in the schema do not grant their verification-only handler access.

Sources: `web/src/features/verification/submit.ts:5`,
`web/src/features/moderation/handlers.ts:6`,
`web/src/server/db/queries/moderation.ts:27`.

### 3.6 Engagement invitation and explicit consent contract

Verified, acknowledged freelancers create invitations; token hashes and a
14-day expiry are stored. A public live link exposes only title and inviting
freelancer. Continuation stores an HTTP-only capability; auth redirects carry
only the fixed /invite/continue path, never the raw token. Mutations bind the
rendered engagement ID so another tab cannot redirect a stale form's response.
Acceptance also binds the rendered profile ID or explicit profile absence;
this optimistic expectation never replaces live authorization.

Acceptance requires current onboarded client identity and separate unchecked
association/consent choices. Creating a new client profile requires trimmed,
nonblank city alongside display name and kind; registration remains optional.
Enforce this in the form and server validation before acceptance writes, with
the D1 batch also requiring city for profile creation. Existing-profile
association reuses its stored city, including legacy NULL, without replacement
fields, migration or backfill. Verification's freelancer city remains optional.
Sources: `web/src/features/engagements/schema.ts:30`,
`web/src/features/engagements/handlers.ts:30`,
`web/src/features/engagements/forms.tsx:52`.

One D1 batch creates/validates the client's profile,
requires exactly that profile identity (or the newly inserted profile when
absence was rendered), creates fresh versioned acceptance and engagement receipt, and transitions to
accepted. A zero-row/conflicted winner aborts all partial profile/acceptance
writes. Changed profile state requires reload and fresh explicit association,
even when names match. Existing-profile association rejects submitted replacement
profile fields instead of silently discarding them. Decline needs no profile or consent. Reject self-invites and wrong roles;
expired/used/cancelled links cannot reopen. Existing legacy accepted rows are
preserved without inventing receipt backfills.

Sources: `web/src/features/engagements/handlers.ts:24`,
`web/src/features/engagements/actions.ts:1`, `web/src/lib/invite-return.ts:1`,
`web/drizzle/0008_engagement_consent.sql:1`.

### 3.7 Private initial intake technical contract

**Rollout.** New draft routes and all save/upload/remove/submit actions require
request-scoped `PRIVATE_INTAKE_ENABLED === "true"`. Missing/malformed context
fails closed; client input cannot enable it. Deny before parsing uploads, DB/R2
writes or opportunistic cleanup. Existing authorized reads continue, and drafts
render read-only. Supported private read/query regression paths with intake
disabled work on 0008 without reading 0009 fields. This is a query-path
compatibility contract only: the full pilot Worker requires all reviewed
migration prerequisites before deployment, even with intake disabled; see
[OPS §7](ops-flag.md#7-production-readiness-gate).
Source: `web/src/features/logs/rollout.ts:6`, `web/src/features/logs/actions.ts:18`.
Real intake also requires the lifecycle/correction prerequisite in PRD-F12.

**Draft and submit.** One initial revision has rev_no=1 and no active publication
pointer. Complete validated saves fix parties, anchor and reference; saves,
uploads and accepted explicit proof removal advance draft_updated_at. First submission obeys the inclusive Manila
15-day window. Ten submitted logs per rolling seven days per filer and three
per rolling twelve months per pair are atomically enforced. Drafts do not consume
log quota. AUTH_RATE_LIMIT holds permanent log-reference-sequence high-water
(expiry 9007199254740991), starting at FL-1042 and reconciling upward with legacy
references. It cannot be deleted/decremented or reused after cleanup.

After private authorization and R2 HEAD checks, one D1 batch rechecks live actor,
policies, accepted parties and exact proof reservations; attaches proofs, opens
one log case, writes IDs-only audit and moves draft to pending last. Zero-row
losers must roll back preceding statements. This slice cannot publish and leaves
current_revision_id/published_at/expires_at NULL. Sources:
`web/src/features/logs/draft.ts:5`, `web/src/features/logs/submit.ts:6`,
`web/src/server/db/queries/logs.ts:26`.

**Proof HTTP dispatch (PRD-F3).** The custom Worker handles
only canonical POST `/api/logs/<id>/proofs`, using the same ID grammar as intake.
Other paths and methods retain the Next dispatcher. Reject absent cookies,
cross-origin requests and disabled intake before setup or body parsing. For an
eligible request create one request-local D1 client, call the existing Better
Auth HTTP get-session handler (including closure hooks and normal session
refresh), then load the current viewer and call the unchanged `uploadProof`.
Forward distinct auth Set-Cookie headers on the private response. No session,
viewer or binding cache is introduced. Domain guards retain current policy,
verification, accepted engagement, consent, quota and storage authority. Errors
remain bounded/private, with nosniff/noindex; auth infrastructure failure cannot
be treated as an anonymous success. This changes dispatch, not the schema, proof
API or publication authority. INDEX owns delivery; hosted reliability remains
unproven until an actual retest. The internal get-session HTTP call also retains
the existing auth rate limiter and bounded Retry-After response. Upload feedback
distinguishes the domain's daily `quota` refusal from generic/auth HTTP 429;
authentication throttling must not tell a user their daily proof quota is spent.
Sources:
`web/custom-worker.ts:8`, `web/src/server/proof-upload-http.ts:15`.

**Proof upload/delivery.** Bound multipart before parsing. Enforce PRD file types,
actual size/signature and max five proofs. Upload quota is twenty attempts per
user/Manila day; atomic private-upload counters and reservations are not refunded
by deletion. Generate logs/<logId>/<proofId> keys. Reserve uploading metadata with
final size/hash/MIME before R2 put; uploading alone is not evidence of complete
bytes. Check HEAD integrity before attach or download. Ordinary proof delivery
uses a minimal proof authorization projection sharing the private-log reader's
exact party, selected-current-or-initial-revision, visibility and expiry
predicates; it does not build the page's tags/proof-list/review-history payload
to decide access. Viewer role, current policies, ban/deactivation and both the
selected revision's and requested proof's natural/assessed deadlines are checked
before R2 GET and again afterwards. No viewer, capability or deadline is cached
across that storage await. The legacy private read/query path still omits fields
unavailable at its supported schema boundary. Source:
`web/src/server/db/queries/logs.ts:61`,
`web/src/features/logs/proofs.ts:148`.
D1 and R2 have separate
commit boundaries; await compensation and preserve a concurrently attached file.
Sources: `web/src/features/logs/proofs.ts:16`, `:80`, `:144`.

Downloads authorize filer/named client/actual moderator before R2; bare admin
has no bypass. Return attachment-only files, including PDFs, with generated
filename, allowlisted MIME, private/no-store and nosniff. Missing, unauthorized
and unavailable proof return 404. Image preparation removes metadata but cannot
prove absence of ID content. Recognizable ID labels/payloads reject in facts
before writes, including Pag-IBIG/Fund/HDMF MID and member/membership IDs; genuine
dates, marked amounts and unrelated project MIDs stay valid. Sources:
`web/src/features/logs/proof-upload.tsx:13`,
`web/src/features/verification/privacy.ts:1`.

**Cleanup.** Only unsubmitted drafts idle 30 days and without active holds are
eligible. NULL activity falls back to created_at. Claim pending_purge in D1;
recheck immutable HEAD metadata, delete R2 to confirmation, then mark purged.
Retain compensation tombstones for 30 days. Increment durable purge_attempts
before R2 awaits and select least-attempted first. purge_inflight gives one
exclusive owner; an unproven/crashed owner stays frozen for investigation, with
no timed takeover. Pending-purge freezes conflicting writes and hold release.

Only retire a draft in a conditional D1 batch after bytes are gone, inactivity
and no-hold rechecks pass, and no review case exists. An active hold has no
release timestamp, or release precedes placement. Preserve held/submitted
material. Untracked generated-prefix objects are sweepable after 30 days only
when the parent no longer exists, with repeated tracking/parent checks; retain
untracked objects under any existing parent for investigation. A mismatching R2
object stays tracked. Sources: `web/src/features/logs/cleanup.ts:7`,
`web/src/features/logs/proof-storage.ts:17`, `web/src/features/logs/holds.ts:2`.
This is bounded draft cleanup, not the full retention/closure workflow.

Explicit proof removal has a separate actor-authorized D1 batch: touch activity
before pending-purge freezes parent changes, then claim the exact proof with
live filer/ban/policy/verification, accepted-party, draft, hold and proof-state
predicates. A zero-row mutation rolls back the batch. This committed claim is
the authorization boundary; revocation before it prevents deletion, while
revocation afterward need not cancel the already authorized R2 operation.
Activity remains recorded if R2 subsequently fails. Internal compensation and
cleanup remain actor-independent and never refresh draft activity.

### 3.8 Review rounds and publication (target, PRD-F4)

One MODERATION_CASE represents the whole subject review, including ask-changes.
REVIEW_ROUND is the immutable human decision event. Queue open cases by created_at
ascending then ID, show kind/age and mark overdue at 36 hours. Waiting age and
the 48-hour decision target do not reset on claim/release or resubmission. Claim
and release keep the existing 30-minute compare-and-set lease contract. A case
in awaiting_changes is off the actionable queue but remains visibly waiting.
Resubmission returns it to open; it never reopens a decided case. Verification
continues its separate corrected-new-request workflow (§3.5).

All review mutations recheck moderator role (admin alone is insufficient),
deactivation/ban/current policies, exact case kind and subject, expected active
lease and expected current revision in one D1 batch. Reject a reviewer who is the
filer, named client, or has an accepted engagement with that client, including
historical accepted engagements. Corrections additionally exclude the original
publication round's decider. Claim cannot grant conflict immunity: check again
at decision time. A changed lease, content version or proof set returns a
bounded conflict/reload result with zero partial round/subject/audit writes.

For a log or filer update, decision input names the exact revision, current
publication expectation, reason and a verdict for **every** attached candidate
proof (and supporting counterproof when relevant). Server verifies R2 metadata
before the atomic D1 boundary; frozen size/hash/key and no purge claim must still
match inside it. PROOF_REVIEW ties the exact bytes to this reviewer/round. A new
reviewer supplies their own verdicts.
An authorized moderation proof retrieval issues a stateless HMAC receipt using
domain-separated existing BETTER_AUTH_SECRET (`flag-proof-view-v1`), bound to
actor/case/exact lease/revision/proof ID/SHA/object key/size/issuedAt and expiry
no later than the lease. The private response header/form state carries it,
never a URL or audit log. Decision verifies signature and every current binding;
PROOF_REVIEW.reviewed_at uses trusted issuedAt. This evidences authorized byte
retrieval and the human's verdict attestation, not human cognition. No new
persistent field, table or secret is introduced.
Approval requires 1–5 attached filer proofs in REVISION_PROOF, all accepted by
that round, and the PRD evidence test:
identifiable agreed client/engagement, visible or strongly implied claimed event,
supported filing anchor and supported rating. Never publish because proofs merely
exist or an earlier reviewer accepted a different revision. Rejected or unclear
proof leads to ask-changes/reject, with a private reason.

Decide in one batch: allocate round number; insert verdict receipts/round; stamp
revision decision; set current_revision_id only for approval/correction; update
subject/case state; append IDs-only audit. The case's decision/decider/reason are
terminal summary fields, not a replacement for rounds. ask_changes records a
round and moves case to awaiting_changes with no closed_at or terminal decision;
final approve/reject/uphold/correct/withdraw closes with the actual current time.
When 30-day inactive material is abandoned, close the case with closure_kind=
abandoned before content purge; never invent a moderator reject. Verification
request/history uses its matching case closed_at; ask-changes round dates cannot
start a case-history purge clock.

Initial approval transitions pending -> published, stamps original published_at
once and expires_at = publication plus 12 calendar months in UTC (clamp to the
last valid day if needed). Those two timestamps never change on update, hiding,
restoration or correction. Initial reject -> rejected; ask_changes -> ask_changes.
The same calendar helper governs all 12-month history deadlines: preserve UTC
month/time/milliseconds, increase year by one and use min(original day, days in
target month). Thus 2024-02-29T10:15:00.000Z -> 2025-02-28T10:15:00.000Z,
2026-01-31T10:15:00.000Z -> 2027-01-31T10:15:00.000Z. Do not use SQLite's
unqualified '+12 months' rollover or 365 elapsed days. SQL predicates/trigger
validation and application helper must share these expected values; reads use
the immutable stored expires_at. Thirty-day inactivity/closure periods are
elapsed UTC days; the initial filing window remains Manila calendar dates.
Initial resubmission adds a new immutable revision with new evidence bindings;
preserve every prior submitted revision and original filing anchor/
first_submitted_at. It continues the initially complete on-time filing and does
not consume a new log quota. No new publication is permitted after expiry.

### 3.9 Private corrections and filer updates (target, PRD-F13)

Only the named current client can create CORRECTION_REQUEST for an existing log;
ordinary readers cannot enumerate requests, notes, counterproof or round reasons.
The filer, named client and actual moderators retain relationship-authorized
proof access (INV-4); the private case page is participant-scoped, never part of
the ordinary record projection. One open request per log includes draft and
ask-changes. A repeat after terminal close must include new counterproof bytes
(SHA differs from that client's earlier submitted counterproof for this log) or
a documented new factual item in new_evidence_note, explicitly assessed by the
independent reviewer; replaying identical evidence alone fails. Fingerprints
identify submitted proof bytes, never IDs or government-ID-derived hashes.

Counterproof uses the same bounded upload/signature/size/quota/private-delivery
protocol as §3.7, owner_kind=client, correction_request_id set, revision_id NULL.
Its actor gate is the named onboarded client, replacing the initial-intake
verified-freelancer gate; a client never gains freelancer status by uploading.
At complete submission bind 1–5 byte-complete counterproofs to that request and
open one correction case atomically. Freeze the submitted request and proof set;
ask-changes permits appending new evidence and refreshing draft activity, never
rewriting prior receipts or submitted counterproof. Preserve the original note;
additional factual material is supplied as a new proof, so no extra unmodelled
request-note history is introduced. A request by itself leaves publication and
rating unchanged. An unconflicted moderator may temporarily set published ->
hidden for credible factual/privacy risk with a reasoned IDs-only audit and
CORRECTION_REQUEST hidden_at/hidden_by/hide_reason tuple; these server-controlled
visibility fields do not rewrite the submitted note/evidence. Opinion
disagreement alone is not cause.
Hiding requires an associated documented review hold if private retention must
extend; hiding alone creates no retention extension.

Correction outcomes: uphold leaves the approved pointer unchanged; correct
creates a new kind=correction revision with the moderator as submitted_by,
reviewed same-log evidence and corrected structured fields; withdraw sets parent
withdrawn immediately. ask_changes keeps the request/case open. A corrected
revision and all evidence verdicts are committed with the human decision; clients
never write LOG_REVISION or the publication pointer. Correct marks superseded
inaccurate revisions invalidated_at and ordinary record reads expose only the
new approved content and safe dated update metadata. A justified uphold/correct
may restore a temporarily hidden log only if the same batch rechecks original
expiry, lawful filer-name retention and no other unresolved hiding reason; an
expired log stays excluded. Closed correction requests keep private minimal
history on their own case clock; counterproof bytes never outlive parent expiry
without an explicit bounded hold. If a request outlives that expiry, decide from
lawfully retained evidence or record an assessed withdrawal/unavailability; no
new collection merely to prolong retention.

Read expiry does not permit a new proof download or inspection receipt. A
terminal correction uphold/withdraw may validate retained metadata against that
reviewer's previously issued exact proof-view token and current lease, byte
identity, actor, proof-set and storage fences. This internal path returns no
proof metadata to readers and never relaxes approval/correct/update evidence
rules. Restoration rechecks effective natural and assessed source deadlines
atomically, so terminal completion cannot republish expired or erased content.

Filer updates create a separate draft revision, kind=filer_update, monotonically
allocated rev_no, effective_on later than the previous approved effective date
(or original publication's Manila date), and not a future date.
The previous approved effective date is the maximum approved filer-update date
for this log, even if an intervening correction has NULL effective_on; a
correction never resets the later-date comparison to original publication.
Only the verified, acknowledged original filer submits it; changed payment/rating still needs
proof. REVISION_PROOF may reuse intact same-log filer proof and add newly uploaded
files; it never rebinds an original PROOF_FILE.revision_id. One update proposal
case at a time; after ask-changes create a new revision linked to the same
moderation_case_id, leaving the case's original subject ID stable. The next
REVIEW_ROUND points to this revised proposal; prior rounds/content stay frozen.
Approval switches current pointer atomically; pending/ask-changes/rejected
updates leave the existing eligible publication/rating untouched. Serialize
against correction decisions using expected current_revision_id; concurrent
stale decisions reload and reassess. Abandonment purges only the proposed
revision and exclusively used proof, never shared active proof or publication.

### 3.10 Requests, closure, export and retained copies (target, PRD-F12)

The configured named privacy contact receives email and a current authorized
admin records PRIVACY_REQUEST with received_at, subject, kind, exact scope and
responsible_id. Intake through email is reception, not completed processing.
Verify requester control through an existing authenticated account or recorded
non-ID account-control check before disclosure/irreversible action; never
collect an ID scan/number. Assignment/reassignment is restricted to current
admins, audited by IDs, and a missing responsible processor is a visible blocker.
The responsible processor records per-category assessment: remove, retain until a
finite deadline with basis/hold, redact identity, or deny with reason; record
work completed and remaining MAINTENANCE_TASK/BACKUP_DISPOSITION references.
Correction requests concerning a published log route through §3.9 and its human
decision; admin request processing cannot bypass INV-1 or INV-6.

Assess closure individually within 30 days of received_at. Once closure is
accepted, set USER.deactivated_at and request deactivated_at and revoke all
sessions/OAuth credentials in a rollback-safe operation; every auth/viewer/action
guard and sign-in hook denies deactivated users even if session deletion needs
retry. Record access-revocation failure truthfully. Do not delete USER to invoke
cascades. Cancel unused invitations under the controlled closure operation;
accepted engagement/consent and required case evidence remain only for their
assessed finite purposes. Scrub name/email/image/phone, profile details,
portfolio, auth verification identifiers and unused provider tokens as the
assessment permits, using non-deliverable unique placeholders if RESTRICT
dependencies require a temporary user/profile shell. Such a shell is private,
deactivated, has no reusable authentication and has a finite pending erasure task.
Delete it only after dependent purposes end. Re-registering an email cannot
reactivate a retained shell or inherit its records.

Final shell erasure is one guarded USER DELETE statement. Its BEFORE DELETE
trigger validates the live exact claimed user/purge grant and absence of
session/account/policy/profile dependencies before detaching nullable
PRIVACY_REQUEST.subject_user_id FKs. It detaches other same-subject requests
first and the sole authorizing request last, preserving live subject authority
through every guard; the immutable task target and assessment are never
rewritten. Executing and deferred authorizing requests both participate.
The DELETE and its observed-absence completion receipt commit together, or
all detachment/deletion/receipt effects roll back. A held user, unrelated
subject/request, invalid grant or retained dependency grants no exception.
No general authority bypass or persistent detachment flag is introduced.
Source: `web/drizzle/0012_retention_repairs.sql:5`,
`web/src/features/lifecycle/maintenance.ts:137`.

For the installed Better Auth email-OTP provider, subject ownership matches only
the four exact scalar identifiers `sign-in-otp-<email>`,
`email-verification-otp-<email>`, `forget-password-otp-<email>` and
`change-email-otp-<email>`. Closure removes those subject-bound credentials
before scrubbing the stored email; assessed subject selection uses the identical
mapping. A bare email, prefix match or wildcard is not ownership evidence.
Composite change-email operation is disabled in the configured provider; any
unmapped credential still reaches physical expiry through its own expires_at.
Hashed-code storage and ten-minute code validity are unchanged. This closes the
credential purpose under PRD-F7 and PRD-F12 without identifying another account
whose email happens to start with an OTP identifier prefix.

Before removing a lawfully retained filer's name, hide/withdraw every affected
publication and recalculate by read-time eligibility. A retained named
publication after closure requires an explicit unexpired name_retention_until
from its individual assessment; NULL for a deactivated filer fails closed. There
is no anonymous publication or automatic indefinite refusal of erasure. Client
identity erasure similarly withdraws affected records before removing identity;
ordinary readers cannot see placeholder identities. An approved earlier erasure
can shorten the physical deadline; it never extends original publication expiry.

Policy acceptance is append-only during ordinary use. Scoped maintenance stamps
retired_at when its actual policy/purpose ends, including account closure;
current needed gate rows remain. Engagement-specific consent purpose ends only
after that association and retained evidence purpose end (ENGAGEMENT.
purpose_ended_at), not merely when work ends or a new consent version ships.
Retired rows/receipts expire 12 months from their own actual purpose end unless
an assessment requires earlier erasure or a documented hold applies. Never
rewrite old versions/accepted_at or manufacture missing receipts.

The export downloaded_at clock records atomic capability consumption and a
server delivery attempt; it does not establish human receipt. A completed export
outcome additionally records the responsible processor's verified receipt
reference in existing outcome.deliveryReceiptReference. A consumed token whose
response failed remains deferred or requires a new assessed delivery. No
additional recipient acknowledgment link, email protocol or persistent field is
introduced by this receipt evidence.

Exports are built from an allowlisted subject-data projection after assessment;
exclude other users' contact details, raw auth secrets, private reviewer notes
and material the requester cannot access. Proof inclusion reuses INV-4 for every
file against the verified recipient's stored filer/named-client relationship;
admin status alone never confers proof access. The export service assembles the
authorized recipient projection without returning proof bytes to the issuing
processor or allowing a processor-selected alternate recipient.
Use a private R2 object and EXPORT_DELIVERY with a random hashed single-use token,
maximum 24-hour lifetime, authenticated same-subject delivery, no public URL,
attachment/no-store/nosniff and access checks before bytes.
Cap expiry further to the earliest applicable included-source or assessed
deadline, using the request's structured scope as the manifest of source IDs
and deadlines. Before delivery recheck source existence, privacy/revocation and
deadline intersection; revoke and purge stale artifacts when any included
source becomes unavailable or its assessed lifetime shortens. An export copy
cannot prolong proof/content retention past the source's permitted deadline.
Included unpublished/rejected log metadata uses the same natural maintenance
deadline as its source, even before physical maintenance has run.
For every included source, also intersect the earliest exact purge/redaction
deadline in any current assessed request for that verified subject, including
assessing/executing/deferred purposes. The shared assessment-deadline view joins
current responsible staff, verified subject relationships and identical exact
scope/assessment target, operation, basis and due time. Unrelated JSON or another
subject never shortens/grants authority. A later assessment that shortens the
source lifetime invalidates an already prepared copy before bytes are delivered.
A fulfilled exact redaction is no longer an outstanding deadline for the new
scrubbed shell projection; remaining purge purposes still cap that shell.
Reserve its unique immutable object key with write_inflight=1 before PUT.
Only that preparing invocation settles 1 to 0 after its awaited PUT finishes,
binding delivery ID and original key; 0 to 1, key rotation and timed takeover
are forbidden. Delivery and artifact destruction refuse an unsettled writer;
revocation can clear the token but must retain the key. A crash leaves tracked
unresolved ownership for investigation. On settled failure the writer releases
only its own fence, then confirms exact-object deletion before clearing tracking.
Claim token use atomically; interrupted download requires a new assessed delivery, never replay.
Transmit the secret in an authorization header or dedicated secure HttpOnly
delivery cookie, never a URL/query, referrer, audit field or server log. The
delivery ID itself is not authority. Revoke token_hash on use/revocation and
leave only a minimal receipt after confirmed artifact purge. Artifact bytes become due at
downloaded_at when consumed, or created_at when token_hash is revoked without
consumption, otherwise expires_at. A purge task may complete after confirmed
artifact absence with object_key/token_hash NULL and purged_at set, retaining
the minimal row until 12 months after its privacy request actually closes.
That later receipt deletion requires a new independently due exact grant.
Revocation may shorten an already-issued artifact deadline; that exact claimed
task remains usable only while its immutable due_at is due and no earlier than
the current shortened artifact deadline. It cannot erase the retained receipt.
For auth_kind=session require the undeactivated subject's ordinary session plus
capability. If export and closure are requested together, deliver first when
practicable, but never delay required deactivation/revocation or preserve a
session to complete download. Deactivation revokes any session-mode delivery.
A deactivated/closed person can still contact the named privacy owner; staff
records and independently verifies that subsequent request without reopening
the account. For auth_kind=assessed_capability, require identity_verified_at
within the last 24 hours and an explicit responsible processor assessment of
the private handover channel; the one-use secret authenticates only that
request's preassessed export. It grants no app/session/proof-route access. Staff
records the handover outcome without recording the plaintext secret. A missing
verified channel or unresolved identity leaves export deferred; do not invent
an email transport, reactivate an account or waive proof-recipient checks.
Do not email the artifact/secret link automatically. Purge artifact bytes after download or
expiry and confirm purged_at; request history contains only its minimal receipt.

Physical D1/R2 deletion includes assessed retained copies. BACKUP_DISPOSITION
records each known relevant backup, exact target scope, finite due date and
erase/expire/restore_filter handling with private basis. Segregate immutable
backups until their finite expiry where immediate selective deletion is not
possible; suppress erased subjects before any restore can serve traffic. A
restore filter is a required protective action, not proof of physical deletion:
also record the copy's eventual erase/expire action. Unknown or unverifiable
copy handling leaves a blocked task and a truthful deferred outcome, never
"erased". Review platform-managed and operator-created copies separately under
OPS; do not assert undocumented provider retention. Terminal request outcomes
require assessment/responsible/identity/outcome/closed_at; completed requires
all required tasks and backup actions verified. deferred/denied includes a reason
and finite follow-up for anything still retained. History runs 12 months from
this request's actual close, while outstanding actions keep their own explicit
purpose until resolved. Never mark a request complete merely because it is old.

### 3.11 Bounded holds and maintenance (target, PRD-F12)

RETENTION_HOLD scopes exact targets and names a current responsible staff member,
private review/legal basis, review_due_at and finite expires_at. A log hold covers
its revisions/proofs; every other scope, including case/user, covers only that
exact row. A category-scoped case/user assessment issues separate exact-target
hold rows for each selected dependent object; there is no umbrella case/user
inheritance or hidden coverage parser. At issue, claim and destructive use, the
shared predicate checks an active hold for the exact target, plus its parent log
for revision/proof targets. A revision hold cannot be placed after any proof
used by that revision has a claimed purge task or an unresolved purge fence.
Exact proof and parent-log hold insertion also refuses an unresolved ordinary
compensation `purge_inflight` fence, even when no maintenance task exists.
After awaited storage identity checks, ordinary compensation rechecks its exact
proof attempt, exclusive ownership and shared unheld/isolated-evidence predicates
before deleting bytes. A settled failure releases only that attempt's fence;
a subsequent finite hold can then be placed.
The bounded hourly/staff/intake runner immediately retries settled failed upload
or explicit-removal compensation for exact unsubmitted, unshared evidence;
it does not wait for the content's 30-day deadline. This uses the same isolated
compensation predicate and attempt fence, never a submitted-proof early-erasure
grant. Actor revocation cannot strand already-authorized compensation, while
holds and unresolved owners still prevent deletion. Purged metadata remains
as a late-put tombstone until its independently due physical retirement.
Case-only hold preserves case history, not evidence;
proof-only hold preserves that proof, not unrelated counterproof/history. Active means
released_at NULL and now < expires_at. Overdue review is surfaced; extension is
a new justified bounded row before expiry, never an automatic renewal. Holds
delay private destruction only. They cannot restore visibility, contributor
eligibility, proof access or the original 12-month clock. For legacy hold tuples,
the conservative compatibility rule in §3.4 applies until assessed.

Scheduled retention runs in bounded pages; no public purge endpoint or arbitrary
SQL entry point. The target Worker entry wrapper delegates fetch to generated
OpenNext output and invokes runMaintenance(env, scheduledTime) from an hourly
scheduled handler. Wrangler's main/cron and binding types must be updated in
that implementation, built and tested on the packaged Worker before readiness;
a server function without an executor does not satisfy this contract. One run
handles at most 25 task claims and 25 R2 deletes, returning IDs/counts only;
backlogs stay durable and appear on the staff page. A staff-only retry action
uses the identical runner and guards. Reads/downloads deny at their deadline
independently of scheduler timing; physical destruction is due on the next
hourly sweep and failures/backlog remain visible, never silently called erased.
OPS owns checking scheduler operation, backup inventory and free-tier budget;
no paid resource or upgrade is authorized. The internal runner creates
MAINTENANCE_TASK from a proven due
predicate or a responsible processor's recorded assessment, exact row/operation,
and a short authorization window (at most one hour for claiming). Human-triggered
tasks recheck current staff/deactivation/ban; scheduled tasks use fixed server
identity/action codes. Only server entry points issue tasks. Client-supplied
target IDs/basis never grant maintenance. Grant expiry limits the claim, not an
already committed R2 operation. A claimed task/purge_inflight is exclusive and
freezes new holds, proof access, attachments and publication changes for affected
rows; an unproven crashed owner is blocked for investigation, never stolen after
a timer. Failed known operations may release/retry with durable attempts.

After its awaited storage I/O has settled, the executing proof-purge owner may
release only its own fence even if current staff/policy authorization was revoked:
pending_purge stays pending_purge, purge_inflight changes 1 to 0, and the exact
still-claimed proof task, claim and proof attempt remain unchanged. The caller
compares its task ID/claim/attempt and proof attempt; SQL freezes all byte metadata,
origin, status and counters. This nondestructive release never authorizes R2
deletion, a purged status, another object's fence, grant renewal or timer takeover.

A forward migration replaces freeze triggers with equally strict ordinary-write
guards plus **exact operation-specific** maintenance predicates: matching
claimed task target, due timestamp or assessed erasure basis, no active scoped
hold, and required dependency state. No global maintenance flag, disabled
triggers, role-only delete exception, or unqualified USER cascade. A task for
purging a revision cannot authorize rewriting a decision, deleting another
revision, or changing consent. Reviewed content stays immutable; allowed identity
redaction touches only assessed fields. AUTH_RATE_LIMIT reference high-water is
never a maintenance target. Tests must attempt forged, expired, mismatched and
already-used grants as well as legitimate erasure under the same guards.
Task-issue triggers enforce this boundary too: authorized_by NULL is permitted
only for an allowlisted retention_due operation with a currently due row and
no hold; human tasks must join their PRIVACY_REQUEST's verified assessment,
responsible_id=authorized_by, current undeactivated/unbanned admin and needed
policy acceptances, and an exact assessed target/operation/deadline in scope.
The same derived subject-target relation binds that target to the request's
verified subject at assessment, issue, claim and use. It follows stored account,
profile, engagement/log party, correction requester, verification filer and
linked receipt relationships; admin role or existence alone does not establish
subject scope. Detached content-free history with no surviving subject relation
uses its independently due retention path rather than an invented former owner.
Reject arbitrary target types, absent/mismatched assessments, privilege loss,
future/not-yet-due destruction and duplicate live grants before insert/claim.
Task grant fields cannot be edited to broaden scope after issuance. The
maintenance delete/redaction trigger rechecks the same basis as well as the
claimed grant, so inserting a plausible task row never suffices by itself.

Purge order: exclude affected publications from reads first; close actually
abandoned cases; claim exact proof rows (pending_purge, then durable exclusive
purge_inflight); verify byte identity, await R2 deletion/confirmed absence; mark
purged; remove REVISION_PROOF links and detach PROOF_REVIEW proof pointers; delete
proof metadata; detach retained round/correction revision pointers and immutable
origin PROOF_FILE.revision_id only under the exact origin-revision purge task
when a retained later revision still uses that same-log proof. Never rebind its
origin in ordinary writes. Before deleting a current revision, clear the parent's
current_revision_id under the exact parent purge task (publication already
excluded), breaking the RESTRICT cycle. Close any still-open corrections with
an actual erased/abandoned close; under the exact parent purge task detach their
live log_id, preserving immutable subject_ref and the original request/case
close clock. Also detach retained MODERATION_CASE.log_id under that task. These
maintenance-only updates change only the specified nullable pointers; all other
receipt fields remain frozen. Remove tags, eligible revisions and parent;
finally remove no-longer-needed engagements,
receipts, retired acceptance/profile/user data when their independent assessed
purposes permit it. A shared proof is deletable only when no retained revision
needs it. R2 failure leaves tracked retry state; D1 failure after R2 deletion
retries against confirmed absence. Never claim cross-service atomicity. Minimal
case/round/audit history survives content deletion only until its own deadline;
it stores no facts/file bodies. Case-linked audit uses case closed_at, not event
created_at; standalone claim/purpose events acquire retain_until only on actual
purpose close. Unresolved purpose/history is flagged for assessment rather than
silently retaining it because a user remains active.

Every verification request, claim/reclaim/release, inspection and decision audit
INSERT links moderation_case_id to its exact case. Request creation retains its
unique-event atomic batch race gate: the winning owner update inserts the linked
event, and all profile/portfolio/request/case writes require that unique event.
That single D1 batch defers FK validation to transaction commit so the case can
be inserted last, after the still-editable portfolio writes; a missing case or
any other unresolved FK aborts the entire batch. The restrictive FK definition
and ordinary audit
immutability remain. Forward migration 0012_retention_repairs backfills only
NULL links proven by the stored typed subject ID and unique verification case
association for these known actions; it preserves all existing evidence fields,
retain_until values and actual close times. Missing or mismatched associations
remain unclocked for assessment; no close or cleanup-time clock is invented.

A `case` hold may select the exact verification-request ID independently of its
moderation-case ID; each target must exist and its claimed purge fences hold
insertion. A verification moderation case cannot be purged while its typed
VERIFICATION_CASE subject still exists, even under an assessed case erasure or
if that subject is independently held. SQL enforces this prerequisite at issue,
claim and DELETE; the runner and issuers prioritize verification data before
its case across bounded batches and retries. Audit and round dependencies also
keep their case anchor until independently eligible erasure. A case hold does
not itself hold its verification subject, and a subject's independent hold does
not authorize loss of its close anchor. Both lexical ID orders have identical
retention behavior. These dependency checks preserve the actual close anchor;
they do not themselves establish the subject authority for later assessed work.

MODERATION_CASE.verification_subject_user_id records only the exact verification
owner's USER ID. The case INSERT must match its typed live
VERIFICATION_CASE.freelancer_id; clients cannot supply an alternate owner.
Migration 0012 backfills only an existing exact verification
case/request relationship. Missing historical relationships remain unknown;
assessment JSON, task IDs, audit actor identity and close-time guesses cannot
manufacture an owner. All updates to this field are forbidden after migration,
and new verification INSERTs must prove the exact live case/request/user
relationship; other case kinds require NULL.

Case, linked audit and round subject projections use this durable case field
for verification ownership. It survives request erasure, preserving both
already-claimed audit eligibility and later case-task issuance under the same
verified privacy request, current responsible admin, exact scope/assessment,
operation, basis, deadline and independent hold predicates. Other subjects and
the existing actor-owned audit mapping are unchanged. Request-first processing
therefore works across batches of one, deferred work, holds and retries without
an authorization gap or a detached-history bypass.

This field is part of the minimal case receipt, with no independent clock or
maintenance target. It remains present through every BEFORE DELETE guard and is
removed only when the actual case row is deleted; correctness does not depend
on trigger execution order or a separately deletable association row. Any held
case, retained audit/round FK or injected failure rolls back the case, subject
field and completion receipt together; held dependent work keeps its subject
authority until its independent release. The user FK is RESTRICT, so a user
shell also survives while its independently retained case still needs it.
Sources: `web/src/server/db/schema.ts:200`,
`web/src/features/verification/submit.ts:29`,
`web/drizzle/0012_retention_repairs.sql:1`.

The dependency is enforced by dedicated task-issuance, task-claim and case-DELETE
triggers, alongside the unchanged shared exact authority/hold/due-date view.
Adding the dependency inside that view exceeds local D1's compiler memory
budget when expanded into unrelated write guards; materializing the whole view
instead prevents useful predicate pushdown. Dedicated triggers preserve all
existing eligibility checks and add the dependency at each destructive boundary
without that expansion. Source: `web/drizzle/0012_retention_repairs.sql:31`,
`web/src/server/db/queries/moderation.ts:18`,
`web/src/features/verification/submit.ts:11`,
`web/src/features/moderation/handlers.ts:14`,
`web/src/server/db/queries/lifecycle.ts:27`.

| Material | Due predicate before hold/assessment adjustment |
|----------|-------------------------------------------------|
| Published, hidden or withdrawn log and all associated proof bytes | now >= original expires_at, regardless of update date or visibility |
| Unsubmitted draft or abandoned unpublished ask-changes | 30 days since latest accepted activity, falling back to created_at; close abandoned case first |
| Rejected initial log or rejected proposed revision | 30 days after its final rejection; an active publication remains intact |
| Unsubmitted/ask-changes update or correction draft | 30 days inactive; delete only unapproved/exclusively used evidence; preserve minimal closed-case history |
| Minimal verification/moderation/correction/round/audit history | 12 months after that case's actual closed_at; round decisions do not reset it |
| Retired policy/engagement consent | 12 months after actual retired_at/purpose end; no blanket active-account retention |
| Auth verification/OTP credential | Its expires_at; expired bytes/identifier are due on the next bounded hourly sweep, independently of account activity |
| Assessed early erasure, export artifact, backup copy | Its explicit earlier assessment/delivery/copy deadline; blocked copies remain tracked |

The same content-clock views feed task issue, claim and destructive use.
Proof uploads reserve write_inflight=1 and immutable unique proof ID/key before
their PUT. Only that invocation settles 1 to 0 after its awaited PUT finishes;
no 0 to 1 reuse or timed takeover is allowed. While a writer is unsettled,
maintenance cannot claim its proof destruction, delete R2, erase proof metadata
or finish a disposal/parent cascade. Ordinary explicit removal may keep an exact
key tombstone under its existing exclusive purge fence; this does not prove
physical erasure while the writer can still finish. After settling, the uploader
rechecks the immutable reservation, status, holds and current relationship and
compensates only its isolated unattached/unshared bytes. A submitted/shared proof
is preserved. Unresolved writers remain visible for staff investigation.
Initial unsubmitted revisions and proofs are capped by their parent draft's
actual 30-day activity deadline. Parent preparation keeps that unpublished
deadline stable until deletion; it never changes draft status to erase the
due predicate before its dependencies can be purged.
Pending
submitted review is not abandoned material. Ask-changes content follows the
case's latest accepted activity until an actual abandoned close; its minimal
history then follows that close's separate 12-month clock. Rejected proof uses
the final rejection clock, never its earlier upload time. A proof shared by
multiple revisions survives while any retained revision needs it; its detached
origin cannot shorten that lifetime. Original publication expiry caps every
associated content/proof deadline, subject only to an assessed bounded hold.

### 3.12 Client search, records and rating projection (target, PRD-F6, PRD-F14)

All reads require a live undeactivated, unbanned, onboarded session. Freelancers
may search/read registered clients; a client may read only their own record.
Staff proof/case access is separate and does not grant a public record bypass.
Search matches escaped bounded display-name text (parameterized LIKE, literal
wildcards), keeps equal-name profiles separate by ID, orders display name then
ID, and pages by a bounded stable cursor. Return display name, kind, city and
acceptedEngagementCount (accepted associations only, including those without a
log); never contact details or registration/verification IDs. This association
count is distinct from publishedLogCount and is not a reputation calculation.

Use a single shared eligibleLogs query/CTE for every record component and rating:
parent status=published, original expires_at > server now, lawful identifiable
parties, same-log current revision with decision approve/correct,
invalidated_at NULL, and a genuine approving human round with accepted proof
receipts. Missing or purging required proof fails closed. Holds, pending
corrections and proposed updates do not create eligibility. A deactivated filer
requires assessed unexpired name_retention_until; redacted client identities
are excluded. No read returns an expired row even if maintenance is delayed.

From eligibleLogs, order original published_at DESC then ref ASC; select row
number one partitioned by (freelancer_id, client_id). Average **current approved
ratings** of those selected rows, round to one decimal, and count distinct
contributors; a newer ineligible log falls back to an older eligible log. Update
approval changes that log's current rating, never its ordering publication date.
Show Limited record for counts 1–4, including the first contributor's average;
five or more removes only that label. Zero produces no average or stars and the
exact PRD empty state. Do not compute ranks, trust signals or competitive sorting.

publishedLogCount, outcome counts and fixed-tag counts use all eligible current
logs (one current revision per parent), while contributorCount/average use the
per-pair selection above. A tag counts once per eligible log, never per revision.
Newest-first history uses the same original-publication/ref order, includes filer
display names and approved effective/decision dates, and exposes only active
approved facts/rating/tags. Superseded/invalidated content, private requests,
counterproof, verdict reasons and reviewer notes never enter this DTO. The
detail route for unrelated readers renders this same projection only inside
client-record context; no standalone callout page. Private filer/client case
views and proof reads retain their separate relationship checks. All responses
are viewer-scoped, no-store/noindex; no shared cache can retain prior eligibility
after withdrawal, expiry, correction or erasure.

## 4. API surface

Only routes below exist; the remaining features do not acquire an API merely
because an old design named one. Source: `web/src/app/` route files.

| Method/surface | Path | Access | Serves |
|----------------|------|--------|--------|
| Page | /, /sign-in, /legal/privacy, /legal/terms | Public | PRD-F7, PRD-F8 |
| Page/continuation | /invite/[token], /invite/continue | Live capability; sign-in/onboarding before response | PRD-F9 |
| GET/POST | /api/auth/[...all] | Better Auth origin, session and route checks; password and unused check-only OTP routes denied | PRD-F7 |
| Page/actions | /onboarding | Signed-in viewer | PRD-F8 |
| Pages | /home, /engagements, /verification | Onboarded; feature actions repeat authorization | PRD-F1, PRD-F9 |
| Pages/actions | /moderation/verification, /moderation/verification/[caseId] | Current moderator and valid review lease | PRD-F4 |
| Page | /engagements/[id]/log | Verified owner, accepted engagement, intake enabled | PRD-F2 |
| Page | /logs/[id] | Filer, named client or actual moderator; existing reads continue while disabled | PRD-F2 |
| POST | /api/logs/[id]/proofs | Authorized verified filer, same origin, enabled editable draft | PRD-F3 |
| GET | /api/proofs/[id] | Relationship-authorized proof reader; unauthorized 404 | PRD-F3 |

There is no /sign-up page: sign-in creates accounts by email code. No client
record/search, admin screen, public purge, correction or publication endpoint
exists. Mutation actions live in feature actions.ts files and receive actor
identity from server session guards, never from a client-supplied role.

### 4.1 Target pilot interfaces (delivery state in INDEX)

These additions implement existing PRD scope; the preceding table remains the
source-route inventory. All mutations enforce same-origin/CSRF protection and
server-derived actor identity. Return bounded field/conflict/unavailable errors,
never SQL, submitted evidence, contacts or provider responses.
Target free-text notes, reasons and assessments use bounded validation and the
existing recognizable-ID privacy checks before persistence. No caller may turn
an assessment/evidence note into a new ID-collection surface. This does not
claim a syntactic validator detects every sensitive image or arbitrary text.

| Target surface | Access and command boundary | Serves |
|----------------|-----------------------------|--------|
| /moderation/logs and /moderation/logs/[caseId] | Actual moderator; oldest-first queue, claim/release, per-proof verdicts and review decision | PRD-F4 |
| /moderation/corrections/[caseId] | Actual independent unconflicted moderator; private evidence, temporary risk hide and terminal/ask-changes decision | PRD-F13 |
| /logs/[id]/correction and /api/corrections/[requestId]/proofs (POST) | Named client, existing relationship, intake flag; open/save/submit private request and bounded counterproof upload | PRD-F13 |
| /logs/[id]/update | Verified acknowledged original filer, intake flag; propose/submit later-dated revision | PRD-F13 |
| /admin/privacy and /admin/privacy/[requestId] | Current admin/privacy processor; record, assign, assess, execute/retry and record outcome; no implicit proof-read access | PRD-F12 |
| /api/privacy/exports/[deliveryId] (GET) | Verified subject session plus one-use capability, or separately assessed post-closure export-only capability (§3.10); otherwise 404/no-store | PRD-F12 |
| /clients and /clients/[clientId] | Freelancers search/read; client own record only; same eligible query and bounded cursor | PRD-F6, PRD-F14 |
| Hourly scheduled handler; staff retry action | Fixed internal runner or authorized admin, exact maintenance grants, bounded batches; no public Cron HTTP route | PRD-F12 |

Domain interfaces (server-only, names are the shared implementation boundary):

- `claimReview(caseId, expectedClaim)`, `releaseReview(caseId, expectedClaim)`
  share existing lease validation, kind-dispatch and audit conventions.
- `decideLogReview({caseId, expectedClaim, revisionId, expectedCurrentRevisionId,
  decision, reason, proofVerdicts})` performs §3.8. `decideCorrection` adds the
  exact request ID and corrected structured content only for decision=correct.
  Server allocates revision/round/audit IDs and timestamps.
- `openCorrection(logId)`, `submitCorrection(requestId)` and
  `proposeFilerUpdate(logId, expectedCurrentRevisionId, fields, proofIds)` own
  private draft state; generic client edit/delete of a publication never exists.
- `recordPrivacyRequest`, `assessPrivacyRequest`, `executePrivacyRequest` and
  `prepareExport` require current processor authorization. Lifecycle owns
  `claimMaintenanceTask`, `runMaintenance(env, now)` and
  `canRetainTarget(target, now)`; ordinary feature handlers cannot issue purge
  grants. Proof storage reuses exact immutable metadata and purge ownership.
- `getEligibleClientLogs(clientId, now)` is the shared record/history/aggregate
  selector, returning approved public-field DTOs only. `getClientRecord` and
  `searchClients` apply viewer authorization; `now` is injected by trusted server
  code/tests, never client input. No consumer reconstructs its own eligibility.

`PRIVATE_INTAKE_ENABLED` continues to deny new initial intake, counterproof and
proposed-update writes before body parsing/effects until prerequisite readiness.
Synthetic tests may enable it only in their isolated environment; existing
authorized private reads, moderation and assessed maintenance continue while
disabled. Final source integration must update all guards for deactivated users,
including Better Auth hooks and existing proof/viewer helpers; UI-only closure
does not revoke access.

## 5. Cross-cutting concerns

- Viewer and mutations recheck role, ban, current policies and relationships;
  page layouts alone do not authorize data access.
- All private surfaces deny indexing. Server-rendered content is viewer-scoped;
  no shared incremental cache is configured.
- React request memoization reuses only D1-client/schema and auth configuration
  during a server render (`web/src/server/db/index.ts:15`,
  `web/src/server/auth/index.ts:8`). Viewer, session and query results are not
  memoized; role, ban, policy, relationship and source-deadline checks still query
  current authority. Bindings come from each request, without a cross-request
  client or identity singleton.
- The initial proof-upload route supplies a lazy request-local D1 client through
  `getViewer(requestDb)`, `getAuth(db)` and upload handling. Route handlers do not share
  React render memoization; explicit setup reuse avoids repeated schema/client
  construction there without adding eager domain setup before closed-route gates.
  It retains live session and actor queries and all existing
  origin, intake, relationship, proof and atomic-write guards. This is a scoped
  setup optimization, not evidence that hosted resource failures are resolved.
- The Worker can deny GET proof requests with no Cookie header and exports
  with absent/unsafe authorization or query-token transport before entering
  Next (`web/custom-worker.ts:8`, `web/src/lib/private-http.ts:19`). Denials retain
  404/no-store/nosniff/noindex, and export no-referrer. Cookie/Bearer presence
  grants nothing: other requests still enter the existing live handlers. This
  preflight neither changes other methods nor establishes all CPU-limit failures
  resolved. Delivery state and observed limits remain in INDEX/QAD.
- Six-digit hashed OTP: ten-minute validity, three code attempts; sessions:
  fourteen days. Password reset/credential writes are denied before effects.
  The unused check-only OTP operation is denied before proof lookup/mutation
  through HTTP and server APIs; supported sign-in and email verification remain
  single-use. Password-reset denial takes precedence for reset-type requests.
- D1 HMAC-keyed auth quotas: five requests per fifteen minutes per trusted
  IP/normalized email/route, plus twenty OTP sends per network across addresses.
  IPv6 is grouped by /64; missing trusted IP uses a shared bucket. General auth
  burst limit is twenty/minute. Invitation caps are ten/day and thirty/week.
- Provider requests time out after ten seconds. Rejection/network/timeout returns
  generic 503, never false mail success; HTTP acceptance is not inbox receipt.
  No-provider console OTP is allowed only on actual HTTP loopback outside
  production, even if a production auth URL is mistakenly set to localhost.
- Never log submitted facts/files, codes, tokens, contact/ID content or provider
  bodies. Secrets stay in ignored local config or per-environment secret storage.
  Auth library logging accepts only fixed event codes and allowlisted severity;
  exception text/objects, SQL, parameters and nested causes are discarded. HTTP
  and server API boundaries reconstruct bounded public errors, with generic
  retryable 503 for unexpected failures. Frozen reviewed-name changes receive a
  deliberate 409; SQL guards remain authoritative under races. Same-name updates
  and truthful delivery/logout retry behavior remain supported. Platform log
  retention controls and operational limits are owned by [OPS section 4](ops-flag.md#4-monitoring).
- D1 batch failure rolls back its D1 statements; R2 remains a separate service.
  References checked 2026-10-31: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)
  and [R2 binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

Sources: `web/src/server/auth/config.ts:46`,
`web/src/server/auth/rate-limit.ts:13`, `web/src/server/mail/index.ts:21`,
`web/src/server/db/queries/engagements.ts:1`, `web/open-next.config.ts:12`.

### 5.1 Invariant enforcement

| INV-# | Enforced by | Location | How |
|-------|-------------|----------|-----|
| INV-1 | Intake transitions; target §3.8 human review/proof receipts | `web/drizzle/0009_private_log_intake.sql:8`; target §§3.8–3.9 | Initial intake cannot publish; target publication requires current unconflicted moderator lease, exact approved revision/proofs and atomic round/audit |
| INV-2 | Filer/engagement/proof gates and pending trigger | `web/src/features/logs/submit.ts:6` | Accepted engagement plus 1-5 byte-complete attached proofs in rollback-safe submit |
| INV-3 | Auth/verification/facts validators; no ID-upload route | `web/src/server/auth/privacy.ts:1`, `web/src/features/verification/privacy.ts:1` | Reject recognizable payloads before persistence; no ID image/number/hash field or content-bearing audit |
| INV-4 | Relationship authorization before private R2 reads | `web/src/features/logs/proofs.ts:144` | Filer, named client, actual moderator; unauthorized/bare admin 404 |
| INV-5 | Rating/outcome schema; target §3.12 record calculation | `web/src/server/db/schema.ts:339`; target §3.12 | Only approved per-log rating and latest eligible vote per contributor; aggregate UI/query still to build |
| INV-6 | No client mutation; submitted-row freeze; target scoped maintenance | `web/drizzle/0009_private_log_intake.sql:13`; target §§3.9–3.11 | Clients submit private evidence; human correction creates a new immutable revision; exact assessed purge grants never authorize client publication edits |
| INV-7 | Session/onboarding guards, authorized reads, noindex | `web/src/server/auth/guards.ts:40` | Private content never reaches signed-out readers; client records remain to build |
| INV-8 | Verified current actor inside actions and atomic writes | `web/src/server/auth/guards-core.ts:10`, `web/src/server/db/queries/logs.ts:9` | Role, verification, ban and current acknowledgment rechecked |

## 6. Feature-to-design map

| PRD-F# | Designed | Components | RFC |
|--------|----------|------------|-----|
| PRD-F1 | yes | Verification, live inspection, snapshot history | flag-rfc-001 deferred |
| PRD-F2 | yes | Initial intake §3.7; ask-changes rounds §3.8 | N/A |
| PRD-F3 | yes | Proof reservation, integrity, delivery | N/A |
| PRD-F4 | yes | Verification §3.5; target review rounds/publication §3.8 | N/A |
| PRD-F6 | yes | Target authorized search, record projection and eligibility §3.12 | N/A |
| PRD-F7 | yes | Better Auth, D1 quotas, guards | N/A |
| PRD-F8 | yes | Policy acceptance and onboarding | N/A |
| PRD-F9 | yes | Invitations and explicit consent receipt | N/A |
| PRD-F12 | yes | Target request/export/closure §3.10; holds/physical maintenance §3.11 and ERD/register | N/A |
| PRD-F13 | yes | Target private counterproof, independent decisions and immutable updates §3.9 | N/A |
| PRD-F14 | yes | Rating CHECKs; target eligible aggregate selector §3.12 | N/A |

## 7. Rejected alternatives

No stored ID photos/numbers or paid SMS; use manual live inspection. No
name-based client merging, public proof bucket, public purge endpoint, client
publication edits or unapproved reputation signals. No guessed legacy consent or
profile snapshot backfill. No cross-service transaction claim or cleanup lease
stealing after an arbitrary timer. These preserve the approved boundaries.

## 8. Open questions

No new owner decision is needed for this consolidation. The lifecycle and
publication target contracts are defined above under the 2026-11-02 task
authorization. Implementation, independent review and readiness remain distinct
and are tracked in INDEX. Actual privacy assessments, hold bases/deadlines and
backup inventory are case-specific staff inputs, not invented owner decisions.
