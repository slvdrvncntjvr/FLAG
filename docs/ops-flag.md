---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.24
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-26
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

Current operational state is INDEX section 6; LOG preserves dated release/recovery history. The observed pre-repair dev release is PR16/6f23b4d, Worker a653efae at 100 percent, migrations through 0006 and clean FKs. The current owner-approved candidate adds privacy/history/portfolio repairs and migration 0007; candidate gates, dev migration/release and checkpoint are pending. Production remains held at its old release/schema.

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
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | No actual D1/Time Travel restore drill observed; synthetic native SQLite and local D1 migration/rollback evidence only |
| D1 export | Weekly during the pilot (`wrangler d1 export`, planned remote procedure) | Owner-selected encrypted destination and access still pending | No real remote export/import observed; synthetic SQL export/import passes locally only |
| R2 proofs | Durability of configured private buckets | Cloudflare private Standard buckets last inspected 2026-10-25; not rechecked by this local candidate | No remote backup/restore drill; local put/get/delete primitives only |

## 7. Production readiness gate

A main merge triggers production deployment; it is a release operation. Deployment does not apply SQL. Dev currently has 0000-0006; the repair candidate adds 0007 for immutable request snapshots. Production currently has only 0000-0002, with no verification/profile/portfolio/engagement rows or log tables at the 2026-10-26 read-only preflight. Refresh that state immediately before any authorized migration; never treat this dated observation as a future preflight.

### Scoped dev repair release

1. Finish the three repairs and copy/docs, full candidate gates and independent review; publish a PR into dev and require both hosted jobs. Keep published 0000-0006 unchanged.
2. Before merge, freshly inspect dev ledger/schema, original rows and FKs and capture a recoverable point. Apply only pending 0007 after reviewed migration preservation evidence; it adds nullable submitted_profile and an immutable-snapshot trigger, preserving NULL for legacy cases. Verify all prior values/schema/13 triggers, the new field/trigger, ledger and clean FKs. No fabricated original evidence or historical backfill.
3. Merge under unchanged dev protections, inspect the commit's automatic build, independently map its exact Worker version and run the release verifier with that full UUID. Require correct dev DB/auth/PROOFS bindings, stable 100 percent identity, ten anonymous route/status/noindex/current-policy checks and invalid-code throttling. Authenticated F1 acceptance is separate; synthetic local/browser evidence is not a real government-ID inspection.
4. Record actual release/check evidence and the remaining full-product/production limits, then create the owner-authorized local development checkpoint. A green normal validator and drift check do not mean strict validation, document lock/reconciliation or production acceptance. No extra email, paid change or production command is authorized by this sequence.

### Before production or main promotion

- Obtain the separate production signal and main's required independent developer review/last-push approval; retain verify/dependency-audit, administrator enforcement and no-force-push/deletion protections. Dev's zero required human approvals is the persistent owner policy, not authority to bypass main.
- Establish the accepted encrypted backup destination/access, write-pause/data-loss window, real isolated D1 export/import and Time Travel restoration evidence and R2 recovery/rollback evidence. Native SQLite rehearsal and local D1 atomic rollback are distinct, insufficient proof of remote recovery. scripts/recovery_rehearsal.py covers the published 0000-0005 native boundary, not a complete 0007/production restore drill.
- Rehearse the exact production-shape upgrade through real local D1/Wrangler batches with synthetic existing auth/accounts/sessions/policy rows and empty feature tables; verify preservation at each step, all schema/triggers/FKs, old-version auth/onboarding compatibility, current F1 and idempotent reapplication. Then refresh the actual production ledger/schema/counts/FKs and legacy verification validity/duplicates immediately before mutation.
- Pending production order is 0003 -> 0004 -> 0005 -> 0006 -> 0007 before code deployment. Use the existing BUILD commands only after the release/recovery gates are satisfied. Earlier successful migration files may stay applied when a later file fails; the full sequence is not one atomic rollback unit.
- Published 0005 attempts foreign_keys=OFF then rebuilds engagement_log. D1 cannot disable foreign keys inside its transaction; populated dependent logs/revisions/proofs can make the drop fail. web/tests/migration-preservation.test.ts proves exact local-D1 rollback and empty-log success. The currently observed production shape creates empty log tables in 0004, so this conditional hazard is not a demonstrated production failure. Unexpected populated data requires a separately reviewed preservation plan; never delete real rows or rewrite published migrations to pass it.
- 0006 intentionally rejects invalid legacy inspection/decision/time data and duplicate undecided requests, preserving rollback rather than inventing evidence. 0007 retains legacy snapshots as NULL. Check these preconditions and preserve migration provenance before proceeding.
- Verify production-specific build/guard/no-upload packaging and private flag-proofs safety, budget/alerts and physical-device/Messenger evidence. The old production Worker lacks PROOFS; correct target configuration alone does not retrofit its live binding. After an authorized release, verify independently mapped exact production version/traffic, DB/auth/PROOFS and route/current-policy boundaries plus authorized authenticated F1 acceptance.
- Worker rollback leaves forward D1 schema/data in place; any database restore is a separate incident operation with its own data-loss decision. Account closure, holds/purge, engagement consent, proof/log publication and correction/retention workflows are not implemented or accepted by this baseline.

No production migration, restore, deployment or main merge has been performed by the repair task.
