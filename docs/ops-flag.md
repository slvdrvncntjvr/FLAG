---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.36
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-30
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

Current deployed state is in [INDEX §6](index.md#6-current-development-baseline); remaining work is in [INDEX §7](index.md#7-implemented-scope-and-remaining-work). This document holds operating procedures only. Test results are in [QAD §1](qad-flag.md#1-strategy). Dated receipts are in LOG and git history.

## 1. Environments

| Environment | URL | Branch | Worker / D1 | Deploy trigger | Owner |
|-------------|-----|--------|-------------|----------------|-------|
| Production (default) | https://flag.factsfirst.workers.dev | `main` | `flag` / `flag-db` | Workers Builds auto-deploy on `main`; manual `npm run deploy` also targets default | slvdrvncntjvr |
| Preview | https://flag-dev.factsfirst.workers.dev | `dev` | `flag-dev` / `flag-db-dev` | Workers Builds with separate dev build/deploy commands; manual npm run deploy:dev remains a fallback; no environment named preview exists | slvdrvncntjvr |
| Local | http://localhost:3000 | any | local D1/R2 via `initOpenNextCloudflareForDev` | `npm run dev` | each developer |

Each environment has its own D1 database, its own secrets and its own private PROOFS R2 bucket (`flag-proofs` for production, `flag-proofs-dev` for dev). Local development uses emulated R2. The deploy guard checks the selected account and resource identifiers. It does not check remote privacy settings or spending limits.

## 2. Deploy

Build runtime is Node 24.22.1 from the root and web `.nvmrc` files, with engine-strict. The Workers Builds root is `web`. Build Node is independent of the deployed workerd compatibility_date 2026-10-01 and its flags. Keep runtime vars separate from build settings.

Scripts copied from `web/package.json` (run from `web/`). Migration order: preview before production. Migrations are forward-only and backward compatible.

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

Before any remote migration, take a `wrangler d1 export` backup into the owner's backup folder `C:/Users/Vincent/FLAG-backups`. Apply the migration to dev first, then production. D1 Time Travel is the fallback.

The deploy guards (`web/scripts/check-deploy.mjs`, `web/scripts/check-resource-bindings.mjs`) load the selected Wrangler environment. They check the account, Worker, DB, auth and PROOFS identifiers before upload. They exist because a dev Worker once used production values. Workers Builds branch or name mismatches fail before upload. Local deploy commands still need the operator's authorization. After each deploy, run the smoke check above.

**Rollback:** `npx wrangler rollback` returns the default production Worker to the previous version (`--env dev` for preview). D1 migrations are not rolled back; they are forward-only. Procedure approved by owner 2026-10-13.

## 3. Configuration and secrets

Current runtime code (web/src/server/auth/config.ts, web/src/server/mail/index.ts) reads the names below. Brevo is selected when configured, otherwise Resend. Missing both keys returns HTTP 503 before OTP generation outside actual HTTP localhost development; no prefix match treats localhost.attacker.example as local. Local development may print a code. Mail HTTP errors carry provider and status only. Auth failure logs carry the generic "Sign-in email delivery failed" message, never response bodies. Values are never recorded in docs; local secrets live in gitignored web/.dev.vars. For a new local setup, run `node scripts/setup-local.mjs` from web/. It creates that file with loopback configuration and a fresh random secret, and refuses to overwrite existing credentials.

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

New log intake is off by default. Only the exact server-owned value `true` for `PRIVATE_INTAKE_ENABLED` enables it (`web/src/features/logs/rollout.ts`). Both dev and production are checked in as `"false"` in `web/wrangler.jsonc`. Disposable synthetic test harnesses opt in explicitly. Upload/search burst bindings, `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` and retention Cron wiring are planned. cr-001 authentication limits use the D1 AUTH_RATE_LIMIT table and the existing BETTER_AUTH_SECRET for hashed keys. No SMS or ID-vendor key is required; pilot verification is manual live inspection per PRD-F1, and RFC 001 automatic checking is deferred.

A native R2 binding is not a spending cap. `remote: false` selects local emulation and does not disable the deployed binding. The isolated browser harness uses synthetic credentials and fresh local D1/R2 with no mail keys. It refuses an occupied port and cleans up its own processes and data. Harness results are not provider delivery, deployed sign-in or device evidence.

## 4. Monitoring

| Signal | Source | Threshold | Alert |
|--------|--------|-----------|-------|
| Overdue moderation cases | Implemented verification queue; log-review queue remains later work | Any case open over 36 hours; 48-hour decision target (FLAG-M3) | Verification waiting time shown to moderators; checked at the daily team stand-up |
| Overdue correction requests | Planned correction queue count | Any request open past the 48-hour independent-moderator target (FLAG-M11) | Planned moderator/stand-up check; not an implemented signal |
| Worker errors | Workers Observability | More than 1 percent of requests over 15 minutes | Target owner notification; not yet configured |
| Email delivery failures | Brevo dashboard first, Resend dashboard as fallback | Sign-in code failures | Checked weekly |
| D1 storage | Cloudflare dashboard | 400 MB per database warning | Checked weekly; storage alone does not show daily query headroom |
| Shared Workers/D1/R2 usage | Cloudflare dashboard | Compare against the free allowances in §5 | Owner checks weekly during the pilot and before enabling intake; no automatic cutoff |
| Retention compliance | Planned retention job log plus hold register | 100 percent of expired published records removed from visible history and rating on schedule; 100 percent of holds documented (FLAG-M12) | Planned weekly review; local draft cleanup does not establish full lifecycle compliance |

No public-reply queue metric and no corroboration metric exist: PRD-F5 and PRD-F10 are Retired, so there is nothing to count. Expiry is required policy; full enforcement is planned (PRD-F12).

### 4.1 Logging

| Level | Used for | Destination | Retention |
|-------|----------|-------------|-----------|
| error | Unhandled exceptions with request id and route | Workers Observability | Cloudflare default |
| info | Moderation and correction decisions, sign-ins, verification result codes (ids only) | AUDIT_EVENT table | 12 months after case close (minimal history), not life of the product |

Never log secrets, tokens, request bodies, names, contact data, ID data, proof contents, facts, or file contents. Observability logs and AUDIT_EVENT carry ids and action names only.

## 5. Runbooks

### Cloudflare usage and cost

During the pilot, and before enabling intake, the owner checks Workers, D1 and R2 usage in the Cloudflare dashboard. The check is weekly during the pilot. Stop and ask the owner before any paid upgrade (IDEA §6 Cost).

Both Workers share one account's free R2 allowance: 10 GB-month Standard storage, 1 million Class A and 10 million Class B operations ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). The allowance is not per Worker or per bucket. Budget alerts notify after a spend threshold; they do not stop usage ([budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)). Per-user proof quotas do not limit account usage. Never delete held evidence or shorten approved retention to lower storage.

Cloudflare documents 50 D1 queries per Free Worker invocation, with a batch counting as one request ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). The future cleanup job must fit inside that limit per invocation.

### Enabling private log intake on dev

1. Take a D1 export of dev into `C:/Users/Vincent/FLAG-backups`, then apply migration 0009 to dev (`npm run db:migrate:dev`).
2. Update the privacy notice and terms so they describe logs and proof uploads; the current copy says these are planned. Bumping the policy version makes users re-accept (PRD-F8).
3. Set `PRIVATE_INTAKE_ENABLED` to `"true"` for dev in `web/wrangler.jsonc` and deploy through the normal path.
4. The owner checks the flow on Android Chrome and desktop.
5. The owner checks dashboard usage as described in "Cloudflare usage and cost".

Real material should not be published until log moderation (PRD-F4 for logs) exists. That is product work, tracked in [INDEX §7](index.md#7-implemented-scope-and-remaining-work).

### Overdue moderation cases

**Symptom:** queue shows cases older than 36 hours (48-hour decision target at risk).
**Likely cause:** moderators unavailable; spike in submissions.
**Diagnose:** open `/moderation/verification`; requests are ordered by submission time and show database-clock waiting hours.
**Fix:** project manager assigns an authorized moderator; an expired thirty-minute lease can be reclaimed atomically. Expiry alone does not release the stored claim or decide the case.
**Escalate to:** project manager.

### Overdue correction requests (private review, planned)

**Symptom:** a correction request is open past the 48-hour independent-moderator target.
**Likely cause:** no independent unconflicted moderator available; request needs new-evidence check.
**Diagnose:** open the correction queue; confirm the requester (named client or filer), the one-open-per-log state, and whether repeats carry new evidence; confirm the assigned reviewer differs from the original decider with no conflict.
**Fix:** reassign to an independent unconflicted moderator; decide uphold / ask-changes / correct / withdraw with a reason kept in history. Requesting alone never hides; hide only for credible error or privacy risk during review.
**Escalate to:** project manager.

### Retention maintenance (daily Cron, planned)

**Symptom:** expired rows still visible, or drafts/rejected material past their purge date.
**Planned function:** `runRetentionMaintenance` at `web/src/features/maintenance/run.ts`, invoked from the Workers `scheduled()` Cron event. Planned, not built. There is NO public purge API.
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

**Symptom:** users report a missing sign-in code.
**Likely cause:** Brevo key missing or quota hit; fallback Resend key missing; sender address misconfigured.
**Diagnose:** missing both per-env mail keys produces HTTP 503 at code requests. A provider rejection, network failure or timeout also returns HTTP 503 with EMAIL_DELIVERY_FAILED. Its safe log message is "Sign-in email delivery failed", with no contact, code or provider body. Both Brevo and Resend use direct fetch bounded by `AbortSignal.timeout(10_000)` (`web/src/server/mail/index.ts`); the installed Resend SDK is unused by this helper. Inspect the selected provider's sender, quota, and per-env key configuration. HTTP success means the provider accepted the request; it does not prove inbox delivery. Anonymous remote smoke checks send no email.
**Fix:** rotate or set the per-env mail key; correct `MAIL_FROM`; ask the user to request a new code. Never paste a key into a doc or chat log.
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
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | Restore drill on an isolated copy done 2026-10-26; see LOG. No production restore performed |
| D1 export | Before any remote migration, and weekly during the pilot (`wrangler d1 export`) | Owner selected `C:/Users/Vincent/FLAG-backups`; Windows DPAPI CurrentUser encryption | Encrypted export and restore drill done 2026-10-26; see LOG |
| R2 proofs | Durability of configured private buckets | Cloudflare | Synthetic-object restore check done 2026-10-26; see LOG. No real proof backup exists |

## 7. Production readiness gate

A main merge triggers a production deploy. Deploying does not apply SQL. The production Worker predates the PROOFS binding, so the next production deploy must include it; the deploy guard checks this.

Before promoting to main:

- CI is green on the candidate.
- The owner gives an explicit go-ahead. GitHub branch protection stays as configured in GitHub.
- Take a D1 export of production into `C:/Users/Vincent/FLAG-backups`.
- Apply only the pending migrations, dev first, then production.
- Deploy.
- Run the smoke check (§2).
- Confirm users are asked to re-accept any changed policies.

A Worker rollback leaves the forward schema in place. A D1 restore is a separate owner decision.
