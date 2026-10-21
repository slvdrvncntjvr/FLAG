---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.6
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-21
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

**SDD:** [sdd-flag.md](sdd-flag.md)

---

Accounts/onboarding are deployed in production and dev. Verification, engagement, proof, moderation, record, and retention workflows remain planned. cr-001 repairs deployed to dev on 2026-10-14 as version bd7b2957-e125-4dfe-a4ea-41c139510ca6 after migration 0003 applied to flag-db-dev. Production remains on the previous release. Commands come from BUILD §3 and web/package.json; SDD owns the fields and state.

Dev's live privacy/terms versions 2026-10-14 are verified; existing dev accounts must accept again. Policy text labels planned workflows explicitly and does not claim retention automation already exists. Production policy release remains pending.

## 1. Environments

| Environment | URL | Branch | Worker / D1 | Deploy trigger | Owner |
|-------------|-----|--------|-------------|----------------|-------|
| Production (default) | https://flag.factsfirst.workers.dev | `main` | `flag` / `flag-db` | Workers Builds auto-deploy on `main`; manual `npm run deploy` also targets default | slvdrvncntjvr |
| Preview | https://flag-dev.factsfirst.workers.dev | `dev` | `flag-dev` / `flag-db-dev` | Workers Builds with separate dev build/deploy commands; manual npm run deploy:dev remains a fallback; no environment named preview exists | slvdrvncntjvr |
| Local | http://localhost:3000 | any | local D1/R2 via `initOpenNextCloudflareForDev` | `npm run dev` | each developer |

Each environment has its own D1 database and per-env secrets (`wrangler secret put <NAME> --env dev` for preview). Pilot data never goes into preview. Issue #5 configures PROOFS at `web/wrangler.jsonc:30` (production flag-proofs) and `web/wrangler.jsonc:55` (dev flag-proofs-dev); local development uses emulated R2. `web/vitest.config.mts:13` binds local test storage. These are repository/local changes: remote buckets, privacy settings, and deployment have not been provisioned or verified in this task. Proof upload/streaming and retention workflows remain planned.

2026-10-21 latest remote status supersedes the provisioning note above: owner enabled R2; both configured buckets now exist as Standard with 0 objects/0 B reported by Wrangler. Public r2.dev is disabled, custom domains absent, and Sippy disabled. The only lifecycle rule is Cloudflare's default seven-day abort of incomplete multipart uploads; no automatic completed-object deletion or Infrequent Access transition is configured. Superseded later on 2026-10-21: flag-dev now runs version 765e86dd (deployed 2026-10-20 17:01 UTC after PR #11 merged to dev) with PROOFS bound to flag-proofs-dev, and flag-db-dev has migration 0004 applied. Production flag version 9b1fdc1d still has no PROOFS binding, and flag-db still lacks migrations 0003 and 0004; apply both before any dev-to-main release. At that earlier observation, flag version 9b1fdc1d and flag-dev version b5cb183e had no PROOFS binding and correct separate DB/auth bindings. API evidence is summarized by `web/scripts/audit-r2.mjs:1`; it never exposes proof contents or secret values.

Before releasing this foundation, provision the two named buckets with public r2.dev access and custom domains disabled, verify the target binding, and apply migration 0004_clever_arclight to the target D1 database before deploying code that needs it. The guarded deploy checks Worker, database, auth URL, and bucket selection (`web/scripts/check-resource-bindings.mjs:2`); it cannot prove a remote bucket's privacy settings. Remote release operations require their own owner instruction.

## 2. Deploy

Scripts copied from `web/package.json` (run from `web/`). Migration order: preview before production; migrations are forward-only and backward compatible.

| Step | Command | Notes |
|------|---------|-------|
| Apply migrations (preview) | `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`) | Before the preview code that needs them |
| Apply migrations (production) | `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`) | Before the production code that needs them |
| Workers Builds production | Build npm run build:worker; deploy npm run deploy:worker | Root web; production branch main; never put the full deploy script in Build command |
| Workers Builds dev | Build npm run build:worker:dev; deploy npm run deploy:worker:dev | Root web; production branch dev; both commands select dev |
| Manual deploy (production) | `npm run deploy` | Builds then runs the guarded production deploy |
| Manual deploy (dev) | `npm run deploy:dev` | Builds then runs the guarded dev deploy |
| Smoke check (current release) | Sign in, accept current policies, open /home; verify signed-out /home and /onboarding redirect to /sign-in | Client records and moderation queue are future release checks, not current routes |
| Binding types | `npm run cf-typegen` | After binding changes; --strict-vars false permits both deployed and local URLs |
| Verify dev release | `npm run verify:dev` | Active version's DB/auth/PROOFS bindings, seven anonymous routes, legal versions/noindex, and five-then-429 invalid-code limit; sends no mail or signup |

web/drizzle/0003_melted_the_twelve.sql applied to remote dev on 2026-10-14; no pending dev migrations remained. Apply it to production before production release, with separate owner authorization. Deployment does not apply migrations. Dev migration and deployment were explicitly authorized after the original local-only CR approval.

After every deployment, inspect the deployed version's actual DB binding and BETTER_AUTH_URL. Historical flag-dev version a9393ce2 had production bindings; version 222b8b96 was correct at the initial audit, and released version bd7b2957-e125-4dfe-a4ea-41c139510ca6 was verified correct after this dev release. CI name overrides change the name, not the selected environment's bindings. Unexpected GitHub checks need command/branch inspection; a green build does not prove correct targeting. Dashboard command changes are still pending and were not saved in this session.

Before the requested dev push, cr-001 adds a CI branch/environment check at adapter config load (web/open-next.config.ts:2) and in Wrangler's custom build (web/scripts/check-wrangler-build.mjs:1). A dev commit cannot deploy the production target through the legacy full-deploy build command. A default plain Wrangler deploy in the flag-dev build also fails unless dev is selected. Supported adapter commands propagate their selected environment to child Wrangler commands. Local manual commands remain available. Dry-run tests confirmed both mismatches are rejected before upload. Red checks require correcting the dashboard settings, not disabling the check.

**Rollback:** `npx wrangler rollback` returns the default production Worker to the previous version (`--env dev` for preview). D1 migrations are not rolled back; they are forward-only. Procedure approved by owner 2026-10-13; a rollback dry-run on the `dev`/preview Worker is scheduled as part of pre-pilot readiness and this note is stamped verified once that run passes.

## 3. Configuration and secrets

Current runtime code (web/src/server/auth/config.ts, web/src/server/mail/index.ts) reads the names below. Brevo is selected when configured, otherwise Resend. Missing both keys returns HTTP 503 before OTP generation outside actual HTTP localhost development; no prefix match treats localhost.attacker.example as local. Local development may print a code; provider failure logs carry a status/error name, never response bodies. Values are never recorded in docs; local secrets live in gitignored web/.dev.vars.

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

Planned: PROOFS R2 binding, upload/search burst bindings, TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY, and retention Cron wiring. cr-001 authentication limits use D1 AUTH_RATE_LIMIT and the existing BETTER_AUTH_SECRET for hashed keys. No SMS or ID-vendor key is required; pilot verification is manual live inspection per PRD-F1 and RFC 001 automatic checking remains deferred.

PROOFS status clarification (2026-10-21): configured and provisioned on the feature branch; not bound to the active deployed Workers. Upload endpoints and runtime quota enforcement remain planned. A native R2 binding is not a spend cap, and `remote: false` selects local emulation only; it does not disable the remote binding after deployment.

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
**Diagnose:** open `/moderation`, sort by waiting time.
**Fix:** project manager reassigns moderators for the day; claims older than 30 minutes are released automatically.
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
**Diagnose:** missing both per-env mail keys produces HTTP 503 at code requests after cr-001 is released. Otherwise inspect the selected Brevo/Resend dashboard, sender, quota, and per-env secrets. Better Auth may handle delivery errors in a background callback, so an accepted request alone does not prove delivered mail.
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
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | not yet |
| D1 export | Weekly during the pilot (`wrangler d1 export`) | Owner's encrypted drive | not yet |
| R2 proofs | Durability of the configured private buckets after remote provisioning | Cloudflare (remote provisioning pending); local R2 binding tested | not yet; local put/get/delete primitives pass, not a remote backup/restore test |

## 7. Production readiness gate

- [ ] Rollback tested within the last 14 days
- [ ] Every alert in §4 has a runbook in §5
- [ ] Restore from backup tested
- [ ] No secrets in the repo or in `docs/`
- [ ] Every network-exposed endpoint has auth, or a documented exception (SDD §4)
- [ ] Verify approved legal copy and privacy/terms version 2026-10-14 on deployed pages; planned feature scope remains explicit
