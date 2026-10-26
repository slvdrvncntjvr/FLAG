---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.28
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-27
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

Current operational state is INDEX section6. PR17/source cdcdc50 is integrated on dev45540d8 with its recorded hosted and exact-version release evidence; local checkpoint spine-cp-2026-10-26-1 captures that scoped application baseline. Both dev and production now have0000-0007, fourteen permanent triggers and clean FKs. Production SQL migration completed on2026-10-26 with original data preserved under the bounded write pause recorded in section7; its Worker remains on the old application release9b1fdc1d. Main/application promotion remains separately gated. Documentation publication can trigger a same-code dev build, requiring its own exact-version check. LOG preserves dated history.

## 1. Environments

| Environment | URL | Branch | Worker / D1 | Deploy trigger | Owner |
|-------------|-----|--------|-------------|----------------|-------|
| Production (default) | https://flag.factsfirst.workers.dev | `main` | `flag` / `flag-db` | Workers Builds auto-deploy on `main`; manual `npm run deploy` also targets default | slvdrvncntjvr |
| Preview | https://flag-dev.factsfirst.workers.dev | `dev` | `flag-dev` / `flag-db-dev` | Workers Builds with separate dev build/deploy commands; manual npm run deploy:dev remains a fallback; no environment named preview exists | slvdrvncntjvr |
| Local | http://localhost:3000 | any | local D1/R2 via `initOpenNextCloudflareForDev` | `npm run dev` | each developer |

Each environment has its own D1 database, per-environment secrets and configured private PROOFS R2 bucket (flag-proofs for production, flag-proofs-dev for dev). Local development uses emulated R2. The last recorded bucket inspection found Standard storage, public r2.dev disabled, no custom domains/imports and only multipart-abort cleanup; refresh privacy/cost checks before release. Dev's observed active Worker binds flag-proofs-dev; the old production Worker predates PROOFS and lacks it. Upload/streaming, quotas and retention workflows remain planned. A configuration guard checks selected account/resource identifiers, not remote privacy settings or spending limits.

## 2. Deploy

Build runtime is Node 24.22.1 from root/web .nvmrc and engine-strict; Workers Builds root is web. Build Node is independent of the deployed workerd compatibility_date 2026-10-01 and existing flags. Keep runtime vars separate from build settings. QAD records exact candidate tests/builds; historical installer recovery and inaccessible dashboard overrides remain in LOG.

Scripts copied from `web/package.json` (run from `web/`). Migration order: preview before production; migrations are forward-only and backward compatible.

| Step | Command | Notes |
|------|---------|-------|
| Apply migrations (preview) | `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`) | Before the preview code that needs them |
| Apply migrations (production) | `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`) | Before the production code that needs them |
| Workers Builds production | Build npm run build:worker; deploy npm run deploy:worker | Root web; production branch main; never put the full deploy script in Build command |
| Workers Builds dev | Build npm run build:worker:dev; deploy npm run deploy:worker:dev | Root web; production branch dev; both commands select dev |
| Manual deploy (production) | `npm run deploy` | Builds then runs the guarded production deploy |
| Manual deploy (dev) | `npm run deploy:dev` | Builds then runs the guarded dev deploy |
| Smoke check (current release) | Sign in, accept current policies, open /home; verify signed-out /home and /onboarding redirect to /sign-in | Manual verification/moderation routes are current; client records remain future work |
| Binding types | `npm run cf-typegen` | After binding changes; --strict-vars false permits both deployed and local URLs |
| Verify exact dev release | `npm run verify:dev -- --expected-version <full-candidate-version-uuid>` | Independently map the candidate to a full version UUID first; require that version at 100 percent traffic before binding/route/policy/OTP checks; no mail/signup; see BUILD §3 |
| Diagnose active dev health | `npm run verify:dev -- --health-only` | Explicitly releaseIdentityVerified false; passing diagnostic health cannot satisfy the candidate gate |

Deployment guards load actual selected Wrangler environment and validate account/Worker/DB/auth/PROOFS identifiers. Workers Builds branch/name mismatches fail before upload, including plain Wrangler custom-build entry points; local deliberate deploy commands still need operator authorization. Exact live binding/version verification remains required after any release. INDEX section 6 and this document's section 7 own current migration state; previous releases in LOG are dated observations.

**Rollback:** `npx wrangler rollback` returns the default production Worker to the previous version (`--env dev` for preview). D1 migrations are not rolled back; they are forward-only. Procedure approved by owner 2026-10-13; a rollback dry-run on the `dev`/preview Worker is scheduled as part of pre-pilot readiness and this note is stamped verified once that run passes.

## 3. Configuration and secrets

Current runtime code (web/src/server/auth/config.ts, web/src/server/mail/index.ts) reads the names below. Brevo is selected when configured, otherwise Resend. Missing both keys returns HTTP 503 before OTP generation outside actual HTTP localhost development; no prefix match treats localhost.attacker.example as local. Local development may print a code; mail HTTP errors carry provider/status only, and auth failure logs carry the generic Sign-in email delivery failed message, never response bodies. Values are never recorded in docs; local secrets live in gitignored web/.dev.vars. For a new local setup, run `node scripts/setup-local.mjs` from web/; it creates that file with loopback configuration and a fresh random secret, refusing to overwrite existing credentials (`web/scripts/setup-local.mjs:1`).

| Name | Purpose | Store | Required |
|------|---------|-------|----------|
| `BETTER_AUTH_SECRET` | Session signing | Wrangler secret | yes |
| `BETTER_AUTH_URL` | Public base URL | wrangler.jsonc vars | yes |
| `MAIL_FROM` | Sender address | wrangler.jsonc vars | yes |
| `BREVO_API_KEY` | Transactional email, preferred provider | Wrangler secret | yes (one of the two mail keys) |
| `RESEND_API_KEY` | Transactional email, fallback when Brevo unset | Wrangler secret | yes (one of the two mail keys) |
| `GOOGLE_CLIENT_ID` | Google sign-in (optional) | wrangler.jsonc vars | no — currently disabled without keys |
| `GOOGLE_CLIENT_SECRET` | Google sign-in (optional) | Wrangler secret | no — currently disabled without keys |
| `DB` | D1 binding | wrangler.jsonc | yes |

PROOFS R2 is configured and bound on current dev. Planned: upload/search burst bindings, TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY, and retention Cron wiring. cr-001 authentication limits use D1 AUTH_RATE_LIMIT and the existing BETTER_AUTH_SECRET for hashed keys. No SMS or ID-vendor key is required; pilot verification is manual live inspection per PRD-F1 and RFC 001 automatic checking remains deferred.

Current PROOFS and schema state is INDEX section 6. A native R2 binding is not a spending cap; remote:false selects local emulation and does not disable the deployed binding. The isolated accounts/verification browser harness uses synthetic credentials and fresh local D1/R2 with no mail keys, refuses an occupied port and cleans its owned process tree/data. QAD records results; this is distinct from provider delivery, deployed authenticated F1 and device evidence.

## 4. Monitoring

| Signal | Source | Threshold | Alert |
|--------|--------|-----------|-------|
| Overdue moderation cases | Queue page header count | Any case open over 36 hours; 48-hour decision target (FLAG-M3) | Shown to moderators in the queue; checked at the daily team stand-up |
| Overdue correction requests | Correction queue count | Any request open past the 48-hour independent-moderator target (FLAG-M11) | Shown to moderators; checked at stand-up |
| Worker errors | Workers Observability | More than 1 percent of requests over 15 minutes | Cloudflare notification email to the owner |
| Email delivery failures | Brevo dashboard first, Resend dashboard as fallback | Any bounce on invites, codes, or decision mail | Checked weekly |
| D1 storage | Cloudflare dashboard | 400 MB (free tier limit 500 MB) | Checked weekly |
| Shared R2 account usage | `npm run audit:r2` | Operational warning at 80% of included Standard storage/operations, conservatively counting unknown operations against both classes | Manual CLI report; no email alert or automatic cutoff is claimed configured |
| Retention compliance | Retention job log plus hold register | 100 percent of expired published records removed from visible history and rating on schedule; 100 percent of holds documented (FLAG-M12) | Reviewed weekly |

No public-reply queue metric and no corroboration metric exist: PRD-F5 and PRD-F10 are Retired, so there is nothing to count. No forever-retention signal exists: expiry is enforced.

### 4.1 Logging

| Level | Used for | Destination | Retention |
|-------|----------|-------------|-----------|
| error | Unhandled exceptions with request id and route | Workers Observability | Cloudflare default |
| info | Moderation and correction decisions, sign-ins, verification result codes (ids only) | AUDIT_EVENT table | 12 months after case close (minimal history), not life of the product |

Never log secrets, tokens, request bodies, names, contact data, ID data, proof contents, facts, or file contents. Observability logs and AUDIT_EVENT carry ids and action names only.

## 5. Runbooks

### R2 cost and privacy checks

2026-10-21 local verification repair: `web/scripts/audit-r2.mjs:58` checks every active version against the shared DB/auth/PROOFS validator at `web/scripts/check-resource-bindings.mjs:35`; `web/scripts/verify-dev-release.mjs:36` applies the same check before probing routes. Missing PROOFS now produces an error, including for an older production release that predates R2. Duplicate bindings and wrong resource types also fail. This reports release readiness; it does not deploy or retrofit a live Worker. The audit explicitly reads both default and dev configs even if CLOUDFLARE_ENV is set. Deployment preflight and environment-specific Wrangler custom-build commands also use the selected environment consistently (BUILD §3.1).

Run `npm run audit:r2` from web/ with the approved account. It checks Standard storage, disabled public access/custom domains/imports, lifecycle safety, live Worker environment isolation, and account-wide analytics. A rolling 31-day lookback avoids undercounting caused by a calendar-month reset when the subscription anniversary is unknown; per-bucket storage peaks are summed conservatively, including deleted buckets and metadata. Unknown operation types remain warnings and count against both operation allowances for the warning calculation. Samples can lag; this is an inspection, not runtime enforcement or an invoice.

Exit 1 means a resource/config/analytics check failed or a safety violation exists. Exit 2 means warnings or incomplete billing/alert verification; do not describe it as a clean billing review. The current OAuth token returns 403 for subscriptions and notification policies. More appropriately scoped API access is needed for those account settings, not a dashboard requirement for bucket provisioning. Cloudflare's `usage_model: standard` metadata alone does not prove the Workers Free or Paid subscription. No budget alert has been configured or verified in this task.

Both Workers share the account's R2 allowance: 10 GB-month Standard storage, 1 million Class A and 10 million Class B operations, not one allowance per Worker/bucket. Other projects and prior/deleted data in the billing cycle also count. Infrequent Access has no free tier. Budget alerts notify after a spend threshold and do not stop usage. Source: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/billing/manage/budget-alerts/ (verified 2026-10-21). Do not claim a guaranteed $0 invoice. Keep proof uploads unlaunched until the future upload implementation enforces the approved per-user limits and account-level capacity controls are reviewed; never delete held evidence or shorten approved retention just to lower storage. Current application code has no proof upload or serving endpoint.

### Overdue moderation cases

**Symptom:** queue shows cases older than 36 hours (48-hour decision target at risk).
**Likely cause:** moderators unavailable; spike in submissions.
**Diagnose:** open `/moderation/verification`; requests are ordered by submission time and show database-clock waiting hours.
**Fix:** project manager assigns an authorized moderator; an expired thirty-minute lease can be reclaimed atomically. Expiry alone does not release the stored claim or decide the case.
**Escalate to:** project manager.

### Overdue correction requests (private review)

**Symptom:** a correction request is open past the 48-hour independent-moderator target.
**Likely cause:** no independent unconflicted moderator available; request needs new-evidence check.
**Diagnose:** open the correction queue; confirm the requester (named client or filer), the one-open-per-log state, and whether repeats carry new evidence; confirm the assigned reviewer differs from the original decider with no conflict.
**Fix:** reassign to an independent unconflicted moderator; decide uphold / ask-changes / correct / withdraw with a reason kept in history. Requesting alone never hides; hide only for credible error or privacy risk during review.
**Escalate to:** project manager.

### Retention maintenance (daily Cron, planned)

**Symptom:** expired rows still visible, or drafts/rejected material past their purge date.
**Planned function:** `runRetentionMaintenance` at `web/src/features/maintenance/run.ts`, invoked from the Workers `scheduled()` Cron event. Invocation-wrapper wiring lands with the implementation; the function does not exist yet as of 2026-10-13. There is NO public purge API.
**Behavior when wired:** every read hides expired records regardless of whether maintenance has run yet; the run expires past-`expires_at` rows from reads, purges idle drafts (30 days) including abandoned unpublished ask-changes with cases closed as abandoned, rejected material (30 days after final decision), withdrawn logs at their inherited original-publication 12-month deadline, unapproved abandoned revisions and their proofs (30 days idle), proofs and R2 objects with their logs, abandoned uploads, closure purges per the assessed plan, and audit/metadata past 12 months after case close including authorized minimal-history purges. R2 and D1 purges are separate steps, never one atomic cross-store transaction: claim eligibility in D1, mark rows `pending_purge`, retry the R2 delete to confirmation, then purge the confirmed D1 rows (SDD §3.3). Withdrawn logs leave reads and rating immediately at decision time. Review and legal holds delay physical deletion but never extend visibility or rating contribution; open-review evidence is force-finished, never deleted mid-review. Retention periods are product policy (PRD-F12), not legal mandates.
**Diagnose:** check the Cron trigger status, the retention job log, and the hold register; query for `expires_at` past rows still returned by reads.
**Fix:** re-run the scheduled handler; clear the wiring or schedule fault; resolve holds through review before physical purge. Reader-visible errors (a visible expired log) are treated as an incident even if the Cron log looks clean, because expiry is enforced at read time.
**Escalate to:** slvdrvncntjvr.
**Note:** SDD owns the entities and state transitions; this runbook states operations only. Retention periods are product policy, not legal mandates. Purpose-based retention follows NPC guidance: https://privacy.gov.ph/wp-content/uploads/2022/01/NPC_AdvisoryOpinionNo._2017-024.pdf and https://privacy.gov.ph/right-to-erasure-or-blocking/ .

### Account closure and purge

**Symptom:** a `close` DATA_REQUEST is done and the assessed purge plan is due.
**Behavior:** closing deactivates the account and revokes its sessions and access; contact, credential, portfolio, and ID metadata are removed as the individual assessment permits. The USER row stays as a stub until retained links expire; there is no automatic cascade from a USER delete into unexpired logs, proofs, or consent/audit rows (as-built schema cascades are marked needs-future-migration in SDD §3.3 and must not be relied on). Where a name or content must be erased before expiry, the affected record is hidden or withdrawn and the average recalculated.
**Diagnose:** check the DATA_REQUEST outcome, the stub USER row and its remaining references, and the hold register.
**Fix:** run the assessed purge steps; resolve holds through review before physical purge.
**Escalate to:** slvdrvncntjvr.

### Worker error rate

**Symptom:** Cloudflare notification of elevated errors.
**Likely cause:** a bad deploy or a failing migration.
**Diagnose:** `npx wrangler tail` (add `--env dev` for preview) and the Observability dashboard.
**Fix:** `npx wrangler rollback` (add `--env dev` for preview); if the cause is a migration, ship a forward fix.
**Escalate to:** slvdrvncntjvr.

### Email delivery failures

**Symptom:** users report missing invite, code, or decision mail.
**Likely cause:** Brevo key missing or quota hit; fallback Resend key missing; sender address misconfigured.
**Diagnose:** missing both per-env mail keys produces HTTP 503 at code requests. The delivery repair also returns HTTP 503 with EMAIL_DELIVERY_FAILED for a provider rejection, network failure, or timeout; its safe log message is Sign-in email delivery failed, with no contact/code/provider body. Both Brevo and Resend use direct fetch bounded by AbortSignal.timeout(10_000) (`web/src/server/mail/index.ts:22`, `web/src/server/mail/index.ts:45`); the installed Resend SDK is unused by this helper. Inspect the selected provider's sender, quota, and per-env key configuration. HTTP success means the provider accepted the request; it does not prove inbox delivery. Successful real-provider delivery remains a human release check. Local browser auth/onboarding files and the test:e2e runner now exist with synthetic data (BUILD §3, QAD §1); Current candidate browser results are recorded in QAD. Anonymous remote smoke checks send no email.
**Fix:** rotate or set the per-env mail key; correct `MAIL_FROM`; resend the affected notification. Never paste a key into a doc or chat log.
**Escalate to:** slvdrvncntjvr.

### Personal data breach suspected

**Symptom:** proof, account, or contact/ID data exposed to someone who should not see it (reader sees another party's proof; signed-out request returns record content; admin without a moderator permission reads proof bytes).
**Likely cause:** an authorization bug or a leaked credential.
**Diagnose:** AUDIT_EVENT for the affected rows; Worker logs for the routes involved (ids only); confirm the proof relationship check and the admin-under-moderator-permission rule.
**Fix:** rotate affected secrets; patch and redeploy. Notify the data protection contact immediately. NPC Circular 16-03 sets a 72-hour notification window for the NPC and affected people. Reader-visible filer names on published logs are approved content, not a breach; contact and ID data must never be visible.
**Escalate to:** data protection contact slvdrvncntjvr@gmail.com (owner; LOG Q5, confirmed 2026-10-13).

## 6. Backup and recovery

| What | Frequency | Location | Restore tested |
|------|-----------|----------|----------------|
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | 2026-10-26 isolated remote production-backup import and that isolated DB's own Time Travel restore pass; all original schema/row hashes/FKs verified, owned DB deleted; no production DB restore performed |
| D1 export | Weekly during the pilot (`wrangler d1 export`, planned recurring procedure) | Owner selected `C:/Users/Vincent/FLAG-backups`; Windows DPAPI CurrentUser encryption | 2026-10-26 encrypted export/readback and isolated import/Time Travel restore pass; fresh paused pre-migration export/bookmark and exact frozen-state verification pass; receipts and encrypted backups retained |
| R2 proofs | Durability of configured private buckets | Cloudflare; production bucket private-domain settings rechecked 2026-10-26 | 2026-10-26 remote synthetic-object put/get/delete/restore and final verified404 pass; no actual proof backup or application authorization acceptance follows |

## 7. Production readiness gate

A main merge triggers production deployment; it is a release operation. Deployment does not apply SQL. Dev has0000-0007 including immutable request snapshots. Production now also has0000-0007 after the owner-approved2026-10-26 SQL operation below: eight ledger rows, fourteen permanent triggers, preserved original auth values and clean FKs; no migration remains pending. The production Worker/application is unchanged at9b1fdc1d-c4cb-495c-a343-fb042cbaae68,100percent. Refresh the target state before any later mutation; never replay this historical migration sequence.

### Completed scoped dev repair release

PR17 merged at 07:46:55 UTC on 2026-10-26 only after both required PR checks and independent review passed. Fresh dev preflight showed exactly 0000-0006 and thirteen triggers; a Time Travel recovery bookmark was captured. Wrangler applied only 0007. Pre/post row hashes, schema/columns and FKs prove preservation of every original value/schema object, nullable submitted_profile with no fabricated legacy backfill, one new immutable trigger (fourteen total) and eight ledger rows. No migration remains pending. No actual recovery restore was performed.

The automatic build's GitHub receipt explicitly maps merged 45540d8 to full version 1e1c2440-1ce1-484b-abee-e7c3558000a1. The verifier confirms exact stable 100 percent identity, actual dev DB/auth/PROOFS, all ten anonymous routes/current legal titles/versions/noindex and invalid-code throttling without email/account creation. Both merged-dev hosted jobs pass in run 40287906609. The owner-approved local checkpoint spine-cp-2026-10-26-1 was then created at 45540d8 and verifies CLEAN. Normal SPINE 0.3 passes with four known warnings; strict, Locked/human reconciliation, full-product and production gates remain open.

Future releases must freshly inspect their target and apply only genuinely pending reviewed migrations before code deployment; never replay 0007 from this historical procedure. Documentation-only publication can trigger another same-code build, requiring its own mapped exact-version check recorded on that PR. Real authenticated/manual-inspection acceptance is separate from synthetic test and anonymous release evidence.

### Before production or main promotion

Application promotion preparation,2026-10-27 (Asia/Manila): the owner directed the next recommended steps after SQL completion. Publish the reviewed recovery tooling/evidence through dev, verify any resulting exact dev release, and prepare a draft dev-to-main PR. Fresh local checks of the unchanged application pass the actual production build, production binding guard, no-upload packaging and ten-route isolated packaged-Worker smoke, including the invalid-code throttle with no mail. All seventeen Python tests pass; fresh full/omit-dev audits report zero vulnerabilities. These checks do not establish a deployed production candidate or physical-device/inbox/authenticated acceptance. Main's required independent developer/last-push approval, strict verify/dependency-audit checks pinned to app15368 and administrator enforcement were freshly read back unchanged. Intermittent GitHub connectivity and Orca account-routing startup failures are recorded in LOG; failed starts are not completed reviews.

The promotion candidate must keep the remaining checklist visible: real dev inbox receipt, physical Android/iPhone and Messenger checks, actual live-inspection acceptance for verification, and verified account-tier/headroom/budget alerts. Existing subscription/notification HTTP403 limitations cannot be treated as an alert configuration. Production rollout must require current2026-10-26 policy reacceptance and independently map the exact resulting version/100percent traffic, DB/auth/private PROOFS bindings and route boundaries. SQL0000-0007 is already complete; app promotion never replays that historical operation. Worker rollback retains the forward schema and legitimate subsequent data; restoring D1 remains a separate incident decision.

- Obtain the separate production signal and main's required independent developer review/last-push approval; retain verify/dependency-audit, administrator enforcement and no-force-push/deletion protections. Dev's zero required human approvals is the persistent owner policy, not authority to bypass main.
- Establish the accepted encrypted backup destination/access, write-pause/data-loss window, real isolated D1 export/import and Time Travel restoration evidence and R2 recovery/rollback evidence. Native SQLite rehearsal and local D1 atomic rollback are distinct, insufficient proof of remote recovery. scripts/recovery_rehearsal.py covers the published 0000-0005 native boundary, not a complete 0007/production restore drill.
- Rehearse the exact production-shape upgrade through real local D1/Wrangler batches with synthetic existing auth/accounts/sessions/policy rows and empty feature tables; verify preservation at each step, all schema/triggers/FKs, old-version auth/onboarding compatibility, current F1 and idempotent reapplication. Then refresh the actual production ledger/schema/counts/FKs and legacy verification validity/duplicates immediately before mutation.
- Completed production order on2026-10-26 was0003 ->0004 ->0005 ->0006 ->0007; no file remains pending. Later operations must inspect their own genuine pending set and use BUILD commands only after applicable release/recovery gates. Earlier successful files can remain applied when a later file fails; the sequence is not one atomic rollback unit.
- Published 0005 attempts foreign_keys=OFF then rebuilds engagement_log. D1 cannot disable foreign keys inside its transaction; populated dependent logs/revisions/proofs can make the drop fail. web/tests/migration-preservation.test.ts proves exact local-D1 rollback and empty-log success. The currently observed production shape creates empty log tables in 0004, so this conditional hazard is not a demonstrated production failure. Unexpected populated data requires a separately reviewed preservation plan; never delete real rows or rewrite published migrations to pass it.
- 0006 intentionally rejects invalid legacy inspection/decision/time data and duplicate undecided requests, preserving rollback rather than inventing evidence. 0007 retains legacy snapshots as NULL. Check these preconditions and preserve migration provenance before proceeding.
- Verify production-specific build/guard/no-upload packaging and private flag-proofs safety, budget/alerts and physical-device/Messenger evidence. The old production Worker lacks PROOFS; correct target configuration alone does not retrofit its live binding. After an authorized release, verify independently mapped exact production version/traffic, DB/auth/PROOFS and route/current-policy boundaries plus authorized authenticated F1 acceptance.
- Worker rollback leaves forward D1 schema/data in place; any database restore is a separate incident operation with its own data-loss decision. Account closure, holds/purge, engagement consent, proof/log publication and correction/retention workflows are not implemented or accepted by this baseline.

The PR17 dev-repair task performed no production operation. The subsequent owner-approved production SQL migration is recorded below; application deployment and main merge remain separate.

### Resumed production preparation, 2026-10-26

The recovered owner instructions authorize production migration preparation/execution after its gates, select `C:/Users/Vincent/FLAG-backups`, and accept up to thirty minutes of paused writes with zero planned data loss. These decisions remain in force; they do not authorize a lossy restore or imply main merge/application deployment. LOG records their exact recovery and the additional payload/destination approval required by automatic review.

The complete synthetic Wrangler/D1 rehearsal now passes at base db74ce2 plus tooling: unchanged 0003-0007 preserve both auth-only fixtures at every stage; old-main SQL probes, fresh installation, exact pre/post local restores and no-op reapplication pass. QAD section 1 states source hash, test evidence and limits. This satisfies the local rehearsal portion of the gate, not remote recovery, current-F1 acceptance or a complete old-Worker test.

Read-only preflight at 13:39:54 UTC still finds production ledger 0000-0002, one user, two policy rows, empty feature tables, clean FKs and Worker 9b1fdc1d-c4cb-495c-a343-fb042cbaae68 at 100 percent. All schema and row hashes match the earlier production baseline. Resource inspection finds two D1 databases totaling 491520 bytes, no leftover recovery database, and private production proof-bucket domain settings. D1 analytics for 2026-09-26 through 2026-10-26 report 4639 rows read and 679 written; analytics may lag. Subscription access returns HTTP403, so account-tier/billing assurance is unverified. The production Worker still has no PROOFS binding.

The prior isolated import receipt records HTTP400/code7400 at polling, no completed recovery stages and owned-database deletion. Review identified a missing nested import-success/bookmark check that could mask the original ingestion failure with a malformed poll. The repaired ignored helper retains only diagnostic categories/hashes/response shapes, forbids production/dev targets, bounds owned resource creation and reconciles cleanup. Independent review clears that source for an isolated diagnostic drill, not as proof of restoration. Automatic approval review rejected its resumed invocation before process start because existing permission did not explicitly cover importing the decrypted production-backup payload into a new temporary remote D1 database. LOG Q26 requests that precise approval; no resumed import or production write occurred.

After that approval, complete the isolated import, exact schema/row/ledger/FK comparison, an isolated database's own Time Travel restore and verified cleanup; complete R2 recovery/rollback evidence. Only then establish actual write exclusion covering session-refresh GETs and all other writers, drain in-flight work, capture a fresh paused baseline/bookmark/encrypted export, and apply only reviewed pending migration prefixes with per-stage preservation checks. Stop on unexplained data/schema drift, wrong target/version, unknown commit outcome or insufficient time to verify/reopen within the approved window. Database restoration remains a separate incident decision. The main/application-release gates above stay in place.

### Completed recovery and production SQL, 2026-10-26

Owner approval resolves LOG Q26. The first approved import exposed the original nested ingestion FOREIGN KEY failure; its temporary database was deleted. The restore derivative now orders populated parent-table INSERTs before child-table INSERTs while retaining the exact original statement multiset, values, trigger bodies and internal line endings; populated cycles fail closed. The original encrypted export remains unchanged. Independent source review and synthetic separate-commit probes pass.

The 13:59:41-14:00:09 UTC remote drill passes exact production-backup schema/all-table row-hash comparison and an isolated database's own Time Travel restoration after a controlled synthetic change; FKs are clean and owned database deletion is verified. At14:09 UTC, the private flag-proofs bucket passes a320-byte UUID-owned synthetic object lifecycle: initial404, put/get exact bytes and SHA, independent memory copy, delete404, restore/get exact bytes, final delete404. Its8 offline safety scenarios pass. This is storage recovery mechanics evidence; there are no actual proof files in the migration fixture and no proof workflow or public release is accepted.

The reviewed production SQL plan pins all published migration hashes and helper/expectation/recovery-receipt bytes. Fifteen exact temporary auth-table write guards cover INSERT/UPDATE/DELETE on user/account/session/auth_verification/policy_acceptance, including session-refresh GET writes. After confirmed installation/readback it verifies a rejected no-op UPDATE, captures a fresh paused encrypted export and bookmark, and compares every exported schema/row/column/FK to the frozen state in memory. Each unchanged pending migration is applied through Wrangler with a staged prefix directory and verified ledger/schema/auth preservation before the next. Work calls are bounded to25minutes with the remaining5minutes reserved for verification/reopen; uncertain guard installation, migration or release is explicitly escalated, never treated as rollback. Automatic release requires an exact known compatible stage and unchanged original auth/ledger. Final frozen hashes are recorded before release; legitimate writes after release are not mistaken for migration corruption. No main merge, Worker deployment or automatic production restoration is part of this SQL plan.

The actual write pause ran14:21:10.133-14:28:46.526UTC,456393ms (7minutes36.393seconds), within the approved30minutes. All fifteen guards were confirmed, and the no-op user UPDATE was rejected. A fresh DPAPI CurrentUser encrypted export in the approved backup directory passed ciphertext/decrypt readback and exact frozen schema/rows/columns/FKs; its private pre-migration recovery bookmark is retained with the ignored receipt. The backup includes the exact owned maintenance guards, so an incident restoration would require that retained manifest and separate recovery decision before access is reopened.

0003 passed normally. The0004 postflight stopped on CRLF/LF expectations: installed Wrangler normalizes SQL outside quoted values before sending remote command queries. The applied schema and original rows were sound, but the local expectation had modeled the unnormalized file. The guards stayed installed while independent review extracted the exact installed normalizer, verified quoted-value preservation and reconstructed exact wire-format expectations; no stored SQL or published file was rewritten. A separately reviewed continuation verified the completed0004 ledger/schema/columns/FKs/auth state, original backup ciphertext and same guard set/deadline, then applied only0005-0007. Both the original interrupted receipt and corrected continuation source are preserved locally; the pause clock was never reset.

Final production evidence: all five pending migrations applied once, all original auth rows/columns/FKs and historical ledger values preserved, expected empty feature tables, fourteen permanent triggers, nullable submitted-profile snapshots without fabricated backfill, foreign_keys1 and foreign_key_check empty. Reapplication is an exact no-op. All fifteen exact owned guards were dropped with confirmed readback; temporary config/migration state was removed. The final frozen receipt and fresh post-migration metadata agree exactly. Seven anonymous routes pass expected status/noindex/private redirects and null session, with the unchanged deployed2026-10-12 legal versions. Worker9b1fdc1d remains100percent throughout. No email, sign-in, actual proof backup, application deployment, main merge, paid change, new checkpoint or human reconciliation was performed. Independent postflight review binds the exact receipts and retains the remaining application-release gates.
