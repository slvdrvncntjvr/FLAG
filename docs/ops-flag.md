---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.23
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-26
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

**SDD:** [sdd-flag.md](sdd-flag.md)

---

2026-10-23 automatic-build recovery verified: the owner requested a retry after the [Node 24.22.1 installer definition was published](https://github.com/nodenv/node-build/commit/dcc01056ffb46f40e67dec4d8b3595161d0adfb5) at 2026-10-21 21:30 UTC. Pushing existing documentation-only commit 21ceb0c to dev started [build 2dec3f50-42ef-4159-8ecf-5f7d40fb261b](https://dash.cloudflare.com/1af65da586efd62d6f6d429240395f28/workers/services/view/flag-dev/production/builds/2dec3f50-42ef-4159-8ecf-5f7d40fb261b) at 11:22:40 UTC; GitHub check 120388129436 reports completed/success at 11:24:16 UTC. Dev version 5836dad6-6dc0-41de-8bad-5e672659281e serves 100 percent. npm run verify:dev passes DB/auth/PROOFS bindings, seven route statuses, current policy/noindex checks and invalid-code throttling (five HTTP 400 responses followed by HTTP 429), without mail or account creation. Automatic installation/build/deployment now succeeds with the unchanged Node pin; this recovery does not prove the historical internal installer cause. Query the commit's check-runs list for current status: the initial check ID 120387509820 remained in progress even after the replacement successful check appeared. Direct Builds API access still returns HTTP 403 with the Wrangler login; GitHub rerequest returned HTTP 404, and embedded-browser login was unavailable. Before retry, the verifier passed version 2c7d3326 (the October 21 runtime NODE_VERSION removal). The owner subsequently authorized publishing these reviewed recovery records to dev; another automatic dev build may run for the documentation-only push. No application code, Node pin, migration, compatibility setting, or main/production action changed.

2026-10-21 latest automatic-build diagnosis supersedes the earlier unavailable-log statements below. The owner supplied logs for builds 397b4f17 and fbe48ca5: both detect nodejs@24.22.1 and fail during tool installation before the application build starts. The owner reported removing the unnecessary runtime NODE_VERSION entry. Both committed .nvmrc files contain the exact version followed by a normal LF; the display line breaks do not establish a parsing defect. A fresh public catalog check lists 24.22.0 but no 24.22.1 definition. The asdf Node installer requires a definition for every release ([installer documentation](https://github.com/asdf-vm/asdf-nodejs#manually-updating-node-build-definitions), [definition catalog](https://github.com/nodenv/node-build/tree/main/share/node-build)); missing definition availability is the leading hypothesis, not proof of Cloudflare's internal failure. Installer stderr is still unavailable and could instead reveal a download or network error.

Owner-approved next step: retain Node 24.22.1 and verified dev version 96de7bfa-e634-421c-9159-05b0385046d1; keep Workers compatibility settings and production unchanged. Defer the next automatic-build retry until a 24.22.1 definition is published or Cloudflare confirms a supported installer remedy. Recheck the catalog before retrying, then require a fresh build ID with successful Node installation, dependency installation, dev build and guarded dev deployment, followed by npm run verify:dev against the newly active version. A repeat failure requires installer stderr or Cloudflare support evidence, not another unsupported version-variable change. The latest GitHub check still points to old failed build fbe48ca5 at 14:17 UTC; no new retry or successful CI is claimed. The existing guarded manual dev fallback remains available using the tested exact runtime and commands in BUILD.

Accounts/onboarding are deployed in production and dev. Verification, engagement, proof, moderation, record, and retention workflows remain planned. cr-001 repairs deployed to dev on 2026-10-14 as version bd7b2957-e125-4dfe-a4ea-41c139510ca6 after migration 0003 applied to flag-db-dev. Production remains on the previous release. Commands come from BUILD §3 and web/package.json; SDD owns the fields and state.

2026-10-21 current dev release: validated feature commit 9c0fef1 is integrated into dev, published with authorization record 318e0d8, and deployed to flag-dev as 96de7bfa-e634-421c-9159-05b0385046d1 at 100 percent. The automatic Workers Builds check failed ([build 397b4f17](https://dash.cloudflare.com/1af65da586efd62d6f6d429240395f28/workers/services/view/flag-dev/production/builds/397b4f17-961a-4792-a7ff-077f0db4a9df)); its error cause and dashboard NODE_VERSION override remain unverified because Builds API access returns HTTP 403 and the dashboard requires login. The documented guarded CLI fallback was freshly built and deployed under checksum-verified Node 24.22.1, with no migration. npm run verify:dev passed actual DB/auth/PROOFS bindings, seven anonymous routes, current policy/noindex responses and five HTTP 400 responses followed by HTTP 429 invalid-code throttling, without mail or account creation. Production remains at 9b1fdc1d-c4cb-495c-a343-fb042cbaae68. Both Workers retain compatibility_date 2026-10-01 and existing flags. The merged feature branch was deleted locally/remotely after verification; automatic-build diagnosis remains an open operational issue, not a claim of successful CI.

Verified dev release before the email-delivery repair: PR #12 merged as 923ba24; Workers Builds succeeded and Worker 05b2c2d6-1fe1-4adf-9b64-d4f4acc1e06f passed binding, anonymous route, policy/noindex, and invalid-code throttle checks. Dev migrations through 0005 are applied, with no pending migrations and clean foreign-key integrity. This supersedes older dev observations below. The email-delivery repair is released through owner-directed PR #13 and requires no migration; inspect its deployment result on the PR and run npm run verify:dev for current live metadata. Production remains unchanged and promotion is held for the owner's signal.

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

2026-10-21 Node build migration: root and web/.nvmrc pin 24.22.1, and package engines with engine-strict reject older runtimes. Workers Builds can read web/.nvmrc because its configured build root is web; any dashboard NODE_VERSION override must be absent or match. A read-only authenticated API check confirmed BOTH live Workers retain compatibility_date 2026-10-01 with nodejs_compat and global_fetch_strictly_public. Builds trigger inspection returned HTTP 403/code10000 for both Workers, so dashboard build overrides remain unverified and no remote setting was changed. Build Node and the deployed workerd compatibility settings are independent. The exact Node24.22.1 clean install, 85 Workers tests, 25 Node checks, typechecks, lint, dev Worker build and dev deployment dry run passed locally; All six desktop/360px Chromium cases also pass on Node 24.22.1; the complete runner exits zero and leaves no port-3000 listener, owned server process, or test temporary directory. The dry run exited without uploading and selected flag-db-dev, flag-proofs-dev and the dev auth URL.

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
| Verify exact dev release | `npm run verify:dev -- --expected-version <full-candidate-version-uuid>` | Independently map the candidate to a full version UUID first; require that version at 100 percent traffic before binding/route/policy/OTP checks; no mail/signup; see BUILD §3 |
| Diagnose active dev health | `npm run verify:dev -- --health-only` | Explicitly releaseIdentityVerified false; passing diagnostic health cannot satisfy the candidate gate |

web/drizzle/0003_melted_the_twelve.sql applied to remote dev on 2026-10-14; no pending dev migrations remained. Apply it to production before production release, with separate owner authorization. Deployment does not apply migrations. Dev migration and deployment were explicitly authorized after the original local-only CR approval.

After every deployment, inspect the deployed version's actual DB binding and BETTER_AUTH_URL. Historical flag-dev version a9393ce2 had production bindings; version 222b8b96 was correct at the initial audit, and released version bd7b2957-e125-4dfe-a4ea-41c139510ca6 was verified correct after this dev release. CI name overrides change the name, not the selected environment's bindings. Unexpected GitHub checks need command/branch inspection; a green build does not prove correct targeting. Dashboard command changes are still pending and were not saved in this session.

Before the requested dev push, cr-001 adds a CI branch/environment check at adapter config load (web/open-next.config.ts:2) and in Wrangler's custom build (web/scripts/check-wrangler-build.mjs:1). A dev commit cannot deploy the production target through the legacy full-deploy build command. A default plain Wrangler deploy in the flag-dev build also fails unless dev is selected. Supported adapter commands propagate their selected environment to child Wrangler commands. Local manual commands remain available. Dry-run tests confirmed both mismatches are rejected before upload. Red checks require correcting the dashboard settings, not disabling the check.

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

Planned: PROOFS R2 binding, upload/search burst bindings, TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY, and retention Cron wiring. cr-001 authentication limits use D1 AUTH_RATE_LIMIT and the existing BETTER_AUTH_SECRET for hashed keys. No SMS or ID-vendor key is required; pilot verification is manual live inspection per PRD-F1 and RFC 001 automatic checking remains deferred.

PROOFS status clarification (2026-10-21): configured and provisioned on the feature branch; not bound to the active deployed Workers. Upload endpoints and runtime quota enforcement remain planned. A native R2 binding is not a spend cap, and `remote: false` selects local emulation only; it does not disable the remote binding after deployment.

Local reliability verification (PRD-F7/PRD-F8): `npm run test:e2e` invokes `web/scripts/e2e.mjs:1` with an isolated temporary app and fresh local D1/R2; synthetic credentials and no mail keys; occupied port 3000 is refused. State/OTP capture live outside the watched app, and only its temporary next.config copy receives local persistence options. `web/local-config.example:1` documents the matching loopback auth URL; `node scripts/setup-local.mjs` creates a random secret exclusively and refuses to overwrite existing settings. Chromium verification passes all six cases across desktop and 360px mobile; the complete runner exits zero. Post-run checks found no port-3000 listener, owned E2E/server process, or flag-e2e temporary directory. In the managed sandbox, Wrangler registry access returned EPERM; the successful rerun used approved local access. This is local Next development-mode verification, not a deploy or successful real-provider delivery check.

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
**Diagnose:** missing both per-env mail keys produces HTTP 503 at code requests. The delivery repair also returns HTTP 503 with EMAIL_DELIVERY_FAILED for a provider rejection, network failure, or timeout; its safe log message is Sign-in email delivery failed, with no contact/code/provider body. Both Brevo and Resend use direct fetch bounded by AbortSignal.timeout(10_000) (`web/src/server/mail/index.ts:22`, `web/src/server/mail/index.ts:45`); the installed Resend SDK is unused by this helper. Inspect the selected provider's sender, quota, and per-env key configuration. HTTP success means the provider accepted the request; it does not prove inbox delivery. Successful real-provider delivery remains a human release check. Local browser auth/onboarding files and the test:e2e runner now exist with synthetic data (BUILD §3, QAD §1); Chromium verification passes all six cases across desktop and 360px mobile; the complete runner exits zero. Anonymous remote smoke checks send no email.
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
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | No actual D1/Time Travel restore drill observed; synthetic native SQLite rehearsal only (2026-10-26, below) |
| D1 export | Weekly during the pilot (`wrangler d1 export`, planned remote procedure) | Owner-selected encrypted destination and access still pending | No real remote export/import observed; synthetic SQL export/import passes locally only |
| R2 proofs | Durability of configured private buckets | Cloudflare private Standard buckets last inspected 2026-10-25; not rechecked by this local candidate | No remote backup/restore drill; local put/get/delete primitives only |

## 7. Production readiness gate

Current owner-directed branch policy, 2026-10-26: dev now requires zero approving reviews and require_last_push_approval is false. This is the requested persistent change, not a temporary exception. Strict current-base verify/dependency-audit checks pinned to GitHub Actions app15368, administrator enforcement, stale-review dismissal and force-push/deletion prohibitions remain unchanged. Main retains one approving developer review and independent last-push approval; its complete protection configuration is unchanged. Agent code/scope review and required CI remain part of the development workflow.

Baseline release completed, 2026-10-26: PR #15 merged reviewed head aa90465 into dev as 6fb4af41d5a25023bfa8d0db6a6bf040be906b0e at 05:36:51 UTC. Both post-merge jobs pass in [run 40275166135](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40275166135). Automatic Workers build 7bf13e4a-b6d6-4fd6-a7db-aaef8b1ade13 identifies version 6f67ac16-d9e5-4f23-ba6a-155684ee4a86; live metadata confirms that exact version at 100 percent. The exact-version verifier exits zero with correct dev DB/auth/PROOFS bindings, seven routes, policy/noindex checks, invalid-code statuses 400/400/400/400/400/429 and stable identity before/after probes. Production remains 9b1fdc1d-c4cb-495c-a343-fb042cbaae68; no migration or production action occurred. The single previously authorized sign-in email request to the configured owner inbox returned HTTP200/success after exact release verification; the owner confirmed inbox receipt on 2026-10-26; no code/cookie was recorded, and no sign-in or signup was attempted. F1 application code remains the tested 030fa63 candidate; its local branch incorporates dev history without application changes. F1 publication/release and dev0006 are separate gates. Earlier blocked-merge, temporary-exception and pending-baseline observations below are historical.

### Planned dev-only 0006 release sequence (not executed)

Latest owner authorization, 2026-10-26 (coordinator relay): the owner directed, "lnzem would never review this can you just review this and merge if ok". Parent review of exact baseline aa90465 found no blocker and both required hosted checks pass. Both normal merge and the owner-authorized admin merge attempt were rejected; GraphQL requires approval from someone other than the last pusher. PR #15 remains OPEN with no merge commit, unchanged aa90465 head and both required checks SUCCESS. Parent requested permission for a temporary dev-only settings exception (zero required approvals and last-push approval disabled for this merge, then exact restoration); no answer or settings change is recorded. Repository branch protections and main remain unchanged. This supersedes the earlier requirement to wait for lnzem for this PR; it grants no general review bypass, F1 release or main/production authority. Earlier pending-review LOG rows remain history.

2026-10-26 stacked F1 integration: this child is based on baseline aa90465 and contains the copied F1 code/design plus the approved CR-002 contract. Coordinator-observed new-child checks exit zero: clean npm ci, full app/test/E2E types, lint, 234 Workers cases, 38 deployment/release/R2 Node plus five setup checks (43 Node total), ten Python cases, Worker build and ten-route packaged smoke (five HTTP400 then HTTP429, no mail). All ten desktop/mobile browser cases and the complete runner now pass (exit zero in 283.2 seconds), as do the deployment guard and actual no-upload dev dry run. New-child application gates are complete; final independent integration review, parent commit and release gates remain pending. Original-checkout 234 Workers/ten browser/build/ten-route results below are prior evidence, not a substitute for this child's remaining gates. Baseline package/lock/verifier/identity/recovery/workflow stay at aa90465; only packaged smoke routes/count are intentionally extended. No remote command is executed by this documentation integration.

Baseline PR #15 at aa90465 has both required hosted checks SUCCESS in run 40271628427; lnzem is requested and real independent developer approval remains pending. No baseline merge/deployment or updated live pass is recorded. Retain current branch protections and owner release limits; main/production remains held. Contract approval is separate from human reconciliation, document lock and release acceptance.

Fresh dev read-only preflight, reported by the coordinator on 2026-10-26: migrations through 0005 current; verification_case count 0; moderation_case and audit_event absent; foreign_key_check empty; zero writes. This observation is not a future preflight or recovery point. Published migrations 0000–0005 remain unchanged.

1. Complete baseline PR #15 first under its hosted-check/review policy and the owner-authorized one-PR review exception above, then verify the exact live baseline Worker version and bindings before F1 release.
2. Prepare the separately reviewed F1 PR and finish this child's local/hosted gates; refresh dev migration/schema/data/FK preflight and record a recoverable point with the existing release controls before changing dev storage. Preserve the approved F1 inspection/history contract and baseline verifier rechecks.
3. Under separate authorization for the dev-only release step, apply only the pending 0006 verification migration to flag-db-dev before deploying F1. Do not rewrite or replay published 0000–0005, select production, or treat this written plan as execution authority.
4. Check the applied migration ledger and nullable inspection schema, expected moderation/audit tables and constraints, foreign keys, historical-row preservation and expected verification queue backfill without invented audit evidence; stop on mismatch before deploying F1.
5. Deploy the reviewed F1 candidate only through the existing owner limits and branch protections, then verify its independently mapped exact active Worker version, dev bindings/routes, and the deployed authenticated request/claim/inspection/decision/resubmission/audit workflow without storing raw ID material. Anonymous smoke alone does not satisfy the F1 workflow gate.

The populated-0005 recovery issue remains a main/production readiness gate; it is not a blocker for the baseline dev PR, which introduces no migration. Main/production, remote restore, mail, paid changes, document lock, reconciliation and checkpoints remain outside this docs task. The sequence adds no approval policy beyond the existing owner release limits and protections.

### Prior original-checkout F1 and operational evidence

2026-10-26 continuation: baseline runtime/release controls are isolated in child worktree f7-runtime-release-gates; a separately owner-resumed session owns that checkout, and the parent coordinates original-checkout verification and review without duplicate baseline edits. The parent observes local D1/workerd migration preservation/rollback coverage at `web/tests/migration-preservation.test.ts:51`: populated unchanged 0005 fails atomically, empty-log 0005 succeeds, invalid legacy 0006 aborts and valid 0006 preserves rows with correct queue backfill. This narrows the earlier native-only uncertainty but is not a remote recovery drill or a remediation plan for populated production data. Fresh production migrations, actual backup destination/restore and write-pause decisions, billing/inbox/device evidence, exact deployed-candidate verification and the explicit production signal remain gates. No production mutation or spend is authorized by these tests.

2026-10-25 cleanup/status continuation: six restored unused Orca terminals were closed only after each reported idle and a fresh process inspection found zero running validation processes; the coordinator terminal remains. Old supervised attempts were interrupted and their partial work preserved, not reported as successful settlements. Fresh anonymous checks pass all seven basic routes in both live environments: dev still serves restored 0530461e at 100 percent, production still serves 9b1fdc1d at 100 percent. Dev legal pages include policy version 2026-10-14; production legal pages do not. Remote dev/main tips remain 561e917/3582f7e. The adapter runtime repair now passes local packaged workerd checks, while feature browser validation, final review, exact-version deployed verification and real inbox receipt remain release gates. No migration, deployment, push or production change occurred in this continuation. Recommended backup plan is an existing encrypted external drive with separately held recovery key, a provisional 30-minute write pause and zero planned data loss; this is a recommendation only. Windows volume/encryption inspection was denied, so no destination was selected or created and no loss window approved.

### Prior aa90465 baseline runtime controls

### 2026-10-26 baseline runtime and release-control candidate

Owner authorized the recommended bounded repairs/audits and sequential milestone preparation (LOG). This isolated branch prepares a dev PR candidate; no push, PR creation, remote deployment/migration/merge, mail, paid change, protection bypass or checkpoint is performed here. Production remains held. Historical live Worker observations below are not fresh verification of this candidate.

After a separately authorized dev deployment, capture the full expected Worker UUID from that deployment and run `npm run verify:dev -- --expected-version <full Worker UUID>` from web/. The active latest deployment must be unambiguous, at 100 percent on that exact version; candidate presence in history is insufficient. Arguments fail before credentials/network. The verifier checks DB/auth/PROOFS, seven anonymous routes, policy/noindex boundaries and six invalid-code throttle responses, then rechecks active identity before reporting success (`web/scripts/verify-dev-release.mjs:43`). It also checks identity before invalid-code probes. Any observed concurrent version change or unavailable metadata fails the run; rerun after deployment settles. Metadata checks bracket observations but cannot lock deployment or establish source-SHA/request-level provenance. `npm run verify:dev -- --health-only` explicitly reports identity unverified and never substitutes for candidate release verification.

`npm run build:worker:dev` followed by `npm run test:worker:smoke` runs the actual packaged Worker locally (`web/scripts/smoke-built-worker.mjs:1`), using synthetic credentials, a temporary profile/config, local migrated D1 and local R2. It verifies seven anonymous routes, protected redirects, noindex, policy versions 2026-10-14, empty session and invalid-code statuses 400/400/400/400/400/429 with Retry-After; no send-code call, mail, real account or remote resource is used. The finite runner owns process-tree and OS-temp cleanup. This supplements the six auth/onboarding Next-development browser cases; neither proves hosted deployment or real email delivery.

Offline recovery preparation: from repo root run `python scripts/recovery_rehearsal.py` and `python -m unittest discover -s scripts -p 'test_*.py'`. The hash-reviewed migration allowlist ends at 0005. Fresh synthetic native SQLite databases verify original row/schema preservation, independent binary snapshots, pre0003/post0005 SQL export/import, integrity/FK checks and fourteen constraint rejections on both migrated and restored final data. Only ignored `temporary/recovery-rehearsal-report.md` remains; databases/exports are removed. Existing databases and redirected report paths are refused (`scripts/recovery_rehearsal.py:57`, `:418`). This is not a D1/Time Travel/R2 restore or Worker rollback drill.

The populated SQLite transaction compatibility probe must remain visible: migration 0005 uses foreign_keys=OFF, which cannot disable D1 foreign keys inside an implicit transaction. A blocked populated probe with preserved rollback is a readiness limitation, even when native autocommit migration/restore passes. No published migration is rewritten. [Cloudflare foreign-key rules](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) describe the boundary. Before production, retain the existing owner gates for encrypted backup destination/access, accepted write-pause/data-loss window, explicitly isolated real Cloudflare export/import/Time Travel and populated migration rehearsal, source/version correlation, billing/alerts, real mail and device checks. Local evidence does not clear those gates.

### 2026-10-25 baseline promotion preparation

Prior release-controls worker evidence (2026-10-25): dev and main protection PUTs succeeded and fresh independent API readbacks confirm current-base verify/dependency-audit checks pinned to GitHub Actions app15368; one developer approval, stale-review dismissal and independent last-push approval; administrator enforcement; no force pushes or branch deletion. Branch SHAs stayed dev 561e917 and main 3582f7e. This supersedes the unprotected observation and unperformed-protection wording in the earlier dated snapshot below. No disruptive enforcement test was run. Merge protection does not make Cloudflare deployment wait for post-merge CI, or prevent separately authenticated Wrangler releases; production promotion remains held.

Q24 purpose is now established by deployment metadata and original Orca-indexed tool evidence: the intentional Wrangler recovery restored 0530461e after candidate 56f6236e failed `/legal/privacy` with HTTP500. This does not establish human authorization of that historical rollback, its internal deployed exception, or a safe return to the candidate. Coordinator runtime-worker evidence now reproduces seven local packaged-workerd HTTP500 routes and `Unexpected loadManifest(/.next/server/preview-props.json) call` in NextNodeServer.getPreviewProps. Repair and packaged-runtime success remain pending; preserve the active release until the coordinator establishes the repaired candidate's release disposition and exact-version live gate.

Release-identity worker evidence: ten focused regressions, all 35 deployment/R2/identity Node cases and focused lint pass. The real expected-version invocation rejects inactive candidate 56f6236e against active 0530461e before any application/OTP requests. Health-only is a diagnostic, never candidate verification. No live positive-candidate or new health-only pass is claimed by that worker. Neither verifier mode sends mail or creates accounts; invalid-code checks do mutate short-lived limiter state. A metadata check observes traffic at check time and cannot lock it against a later concurrent deployment.

Later coordinator evidence, 2026-10-25: the rollback annotation reads Restore verified dev while investigating new runtime 500. The coordinator reports an Orca-indexed verifier failure (`500 !== 200`) at 06:52:01 UTC and the rollback operation at 07:48:30 UTC in session 01a16c33-53ff-74e0-86ff-bcae0145e135. This explains why successful build/CI cannot establish candidate runtime readiness; it does not establish a repaired candidate, owner inbox receipt or a new live release. Preserve the older active version while runtime repair and exact-version verification proceed under coordinator control. The earlier unknown-cause observations below retain their original observation time; no new deployment or owner release signal is inferred here.

Local verifier command contract at `web/scripts/verify-dev-release.mjs:9` now requires an expected candidate version by default; health-only explicitly reports no release-identity verification. Command guidance above reflects the inspected implementation, not an independent claim that its final tests or a candidate deployment passed. The candidate version must be derived independently from build/deployment evidence; never copy whichever version is already active merely to make the gate pass.

Recovery rehearsal boundary (coordinator report, 2026-10-25): native isolated SQLite rehearsal and seven safety tests passed. A populated always-on-foreign-key transaction probe fails the unchanged migration 0005 rebuild, whereas native autocommit succeeds. This is a robustness warning about transaction semantics, not proof of a current production migration failure: production still lacks 0004's log tables and these workflows have not written logs there. Preserve published migrations; a D1-faithful rehearsal and accepted backup/restore evidence remain promotion prerequisites. No remote restore or production safety proof follows from the native rehearsal.

Planned F1 delivery gate: use SDD §3.5 and QAD H-24/H-25, S-32–S-35/S-38, AB-26–AB-28/AB-31 plus relevant invariant tests before enabling verification. Review/audit storage lands with verification. F9 retains its baseline planned design backlog; original-only receipt schema and handshake-case additions are excluded. Logs, publication, correction, closure, holds and retention automation remain dependent milestones; preserve approved history periods and never store raw ID/QR/phone-derived material. QR RFC remains deferred.

Continuation observation at approximately 07:57 UTC supersedes pending-hosted and active-version assumptions in the earlier snapshot below. PR #14 is merged at `561e917`; both [PR CI](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40170260834) and [merged-dev CI](https://github.com/slvdrvncntjvr/FLAG/actions/runs/40170478839) pass both jobs, including clean install/audit, all application and browser checks, and dev packaging without upload. GitHub Workers check `121100462017` explicitly associates this commit with build `e7e02e0a-8d63-46a8-92bb-65f9c8b2e8de` and version `56f6236e-eb0a-4627-9ada-ca9e59994ff8`; Cloudflare deployment history records that version at 100 percent at 06:51:22 UTC. A later deployment `4850daf6-e4d7-4bf7-bc8a-6e9abe32d656` at 07:48:20 UTC reactivated older version `0530461e-9992-4f4c-8b28-68fbfd1d61b2` at 100 percent. Why that happened is unknown (LOG Q24); preserve it pending the owner's answer. Do not treat successful CI or the earlier candidate deployment as evidence the candidate is currently serving, or publish documentation to auto-deploying dev while this intent is unresolved.

Fresh `npm run verify:dev` passes the older active version's DB/auth/PROOFS bindings, seven routes, current legal/noindex responses and invalid-code throttle without mail/signup. Dev has no pending migrations and `PRAGMA foreign_key_check` returns no rows/zero writes. Main remains `3582f7e31c0d1caf3c22d71adcd8a7f9756e80d1`; production remains `9b1fdc1d-c4cb-495c-a343-fb042cbaae68`, with 0003–0005 pending. Fresh R2 audit confirms both buckets private Standard/no domains/imports; it exits 1 because held production lacks PROOFS, with unclassified-operation warnings and HTTP 403 for billing and alerts. Observed storage upper bound is zero; this remains neither invoice nor budget enforcement. No remote deployment, migration, rollback, push or email was performed by this continuation. The single authorized inbox test must follow verification of the updated dev baseline; receipt and physical-device checks remain human evidence.

PR #14's first hosted run `40169695258` passed dependency-audit and stopped verify at an unauthenticated clone of the private SPINE repository. Local canonical docs/checkpoint checks remain valid, but they were not run in that hosted job. Public hosted application CI is corrected to use no engine credentials/source copy and to state the local-only canonical validation boundary. All application checks and pinned-runner unit tests remain required workflow steps; hosted success and post-merge dev verification still need observation.

Fresh read-only inspection of the existing release: dev runs version `0530461e-9992-4f4c-8b28-68fbfd1d61b2` at 100 percent, with correct dev DB/auth/PROOFS bindings, seven anonymous-route checks, current policy/noindex responses and invalid-code throttling passing. GitHub reports the automatic dev build for `6f85584` successful (build `8bd2e40f-403d-4a2c-afe5-03e0cb82da6f`). These observations describe the pre-repair release, not the new uncommitted candidate. Direct Builds API access remains HTTP 403, and version metadata has no source-SHA annotation; time/check correlation is evidence, not exact artifact provenance.

Dev has no pending migrations. Production remains version `9b1fdc1d-c4cb-495c-a343-fb042cbaae68`, lacks PROOFS, and has migrations `0003_melted_the_twelve.sql`, `0004_clever_arclight.sql`, `0005_happy_vermin.sql` pending. Read-only foreign-key checks are clean in both databases. Both Workers retain compatibility date 2026-10-01, the existing two flags and observability. Both have BETTER_AUTH_SECRET and BREVO_API_KEY secret names; optional Google credentials are absent. Secret-name presence does not prove validity or inbox delivery.

Both R2 buckets are private Standard storage with no custom domains/imports. Shared-account usage is low in the observed rolling window; billing/subscription and notification-policy reads return HTTP 403. The R2 audit exits 1 for held production's missing binding and reports billing/unknown-operation warnings; this is not a dev isolation failure or a verified invoice/spending cap. A production Time Travel bookmark is available, but no restore or rollback drill has been performed.

The following are ordered release prerequisites, not actions executed or authorized by this baseline pass:

1. Freeze the reviewed auth/onboarding candidate and require its clean local/hosted CI gates plus a verified dev deployment. Preserve the previous main SHA and production Worker version. The remaining full-product milestones in BUILD §8 are separate.
2. Confirm the actual Workers build root, selected Node, branch/environment-specific commands and source-to-version correlation for the candidate. Required branch checks/review controls are now applied as recorded above; retain them. Require the packaged workerd smoke gate as well as the development-mode browser suite, then verify the exact active candidate. Post-merge Cloudflare deployment and CI remain independent; successful hosted packaging alone does not prove runtime health.
3. Obtain an owner-controlled encrypted backup destination and write-pause plan; capture fresh production migration/schema/FK state and Time Travel bookmark. Rehearse backup restore and migrations 0003–0005 in an explicitly isolated environment with sanitized/existing-like data. A bookmark or local primitive test alone does not satisfy restore evidence. Record a recent authorized dev rollback/recovery drill before promotion.
4. Confirm free-tier/billing and alert recipients/thresholds in an authenticated dashboard, and verify real mail delivery and physical Android/Messenger behavior. Owner authorized one dev code to the configured inbox; report actual acceptance/receipt separately and never record the code. Unavailable permissions remain explicit blockers to claiming these settings verified.
5. Only after the owner's production signal, apply pending production migrations in order using BUILD §3, verify pending/FK/schema state, then promote the reviewed candidate through a dev-to-main PR. Main's automatic deployment makes the merge itself a release. The production release must bind flag-db, the production auth URL and flag-proofs; never select dev bindings.
6. Inspect the deployed production version/traffic/bindings and anonymous policy/access behavior; complete the separately authorized real-user checks and monitor errors/usage. A Worker rollback does not undo D1 migrations. Any database restore needs explicit incident approval and an accepted data-loss window; never improvise down migrations or erase migration history.

No production migration, deployment, backup export, restore, rollback, paid change or branch-protection change was performed by the read-only preparation.

- [ ] Rollback tested within the last 14 days
- [ ] Every alert in §4 has a runbook in §5
- [ ] Restore from backup tested
- [ ] No secrets in the repo or in `docs/`
- [ ] Every network-exposed endpoint has auth, or a documented exception (SDD §4)
- [ ] Verify approved legal copy and privacy/terms version 2026-10-14 on deployed pages; planned feature scope remains explicit
