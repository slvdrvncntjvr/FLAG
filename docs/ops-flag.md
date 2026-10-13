---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 1.0
status: Locked
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-13
reconciled: 2026-10-13
---

# Ops & Observability: FLAG

**SDD:** [sdd-flag.md](sdd-flag.md)

---

Nothing here is deployed yet. Commands are the planned ones from BUILD §3 and `web/package.json` scripts; each is marked verified only after it has been run against a real environment. Distinctions between planned and implemented are stated inline. SDD owns the actual fields and state; this doc states operations only and guesses no SQL columns.

Docs-only alignment changes no shipped legal pages: the live privacy/terms copy still reflects the prior scope (no rating, one public reply, permanent retention) and must be reconciled with the approved contract before launch of the new scope.

## 1. Environments

| Environment | URL | Branch | Worker / D1 | Deploy trigger | Owner |
|-------------|-----|--------|-------------|----------------|-------|
| Production (default) | https://flag.factsfirst.workers.dev | `main` | `flag` / `flag-db` | Workers Builds auto-deploy on `main`; manual `npm run deploy` also targets default | slvdrvncntjvr |
| Preview | https://flag-dev.factsfirst.workers.dev | `dev` | `flag-dev` / `flag-db-dev` | Manual `npm run deploy:dev` (builds then deploys with `--env dev`); no `--env preview` exists in `wrangler.jsonc` | slvdrvncntjvr |
| Local | http://localhost:3000 | any | local D1/R2 via `initOpenNextCloudflareForDev` | `npm run dev` | each developer |

Each environment has its own D1 database and per-env secrets (`wrangler secret put <NAME> --env dev` for preview). Pilot data never goes into preview. R2 for proof files is PLANNED, not yet wired: `wrangler.jsonc` has no `PROOFS` binding as of 2026-10-13, so no claim is made that proof storage is already connected.

## 2. Deploy

Scripts copied from `web/package.json` (run from `web/`). Migration order: preview before production; migrations are forward-only and backward compatible.

| Step | Command | Notes |
|------|---------|-------|
| Apply migrations (preview) | `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`) | Before the preview code that needs them |
| Apply migrations (production) | `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`) | Before the production code that needs them |
| Deploy (production, default) | `npm run deploy` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`) | Targets the default production Worker |
| Deploy (preview) | `npm run deploy:dev` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy -- --env dev`) | The only preview path; `--env preview` does not exist |
| Smoke check | Sign in, open a client record, open the moderation queue | Manual, two minutes |
| Binding types | `npm run cf-typegen` (`wrangler types --env-interface CloudflareEnv`) | After binding changes |

**Rollback:** `npx wrangler rollback` returns the default production Worker to the previous version (`--env dev` for preview). D1 migrations are not rolled back; they are forward-only. Procedure approved by owner 2026-10-13; a rollback dry-run on the `dev`/preview Worker is scheduled as part of pre-pilot readiness and this note is stamped verified once that run passes.

## 3. Configuration and secrets

Current runtime code (`web/src/server/auth/config.ts`, `web/src/server/mail/index.ts`) reads the names below. Brevo-first: `sendMail` selects Brevo when `BREVO_API_KEY` is set, else Resend, else a local/dev-console no-op. Values are never recorded in this document or any other doc in `docs/`. Local values live in `web/.dev.vars`, which is gitignored.

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

Planned, not launch-required: `PROOFS` R2 binding (proof storage, planned), Rate Limiting bindings (planned), `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (bot check stays disabled without keys), Workers Cron trigger wiring for retention (planned, §5). There is NO SMS key and NO PhilSys/ID-vendor key launch requirement: pilot verification is manual live inspection per PRD-F1, and RFC 001 automatic checking is deferred future. No secret for a prohibited-forever flow exists.

## 4. Monitoring

| Signal | Source | Threshold | Alert |
|--------|--------|-----------|-------|
| Overdue moderation cases | Queue page header count | Any case open over 36 hours; 48-hour decision target (FLAG-M3) | Shown to moderators in the queue; checked at the daily team stand-up |
| Overdue correction requests | Correction queue count | Any request open past the 48-hour independent-moderator target (FLAG-M11) | Shown to moderators; checked at stand-up |
| Worker errors | Workers Observability | More than 1 percent of requests over 15 minutes | Cloudflare notification email to the owner |
| Email delivery failures | Brevo dashboard first, Resend dashboard as fallback | Any bounce on invites, codes, or decision mail | Checked weekly |
| D1 storage | Cloudflare dashboard | 400 MB (free tier limit 500 MB) | Checked weekly |
| Retention compliance | Retention job log plus hold register | 100 percent of expired published records removed from visible history and rating on schedule; 100 percent of holds documented (FLAG-M12) | Reviewed weekly |

No public-reply queue metric and no corroboration metric exist: PRD-F5 and PRD-F10 are Retired, so there is nothing to count. No forever-retention signal exists: expiry is enforced.

### 4.1 Logging

| Level | Used for | Destination | Retention |
|-------|----------|-------------|-----------|
| error | Unhandled exceptions with request id and route | Workers Observability | Cloudflare default |
| info | Moderation and correction decisions, sign-ins, verification result codes (ids only) | AUDIT_EVENT table | 12 months after case close (minimal history), not life of the product |

Never log secrets, tokens, request bodies, names, contact data, ID data, proof contents, facts, or file contents. Observability logs and AUDIT_EVENT carry ids and action names only.

## 5. Runbooks

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
**Diagnose:** check which provider `sendMail` selected (Brevo when its key is set, else Resend, else no-op); inspect the Brevo dashboard first, then Resend; confirm `MAIL_FROM` and per-env secrets.
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
| R2 proofs | Durability of the planned bucket once wired | Cloudflare (planned) | n/a — bucket not yet wired |

## 7. Production readiness gate

- [ ] Rollback tested within the last 14 days
- [ ] Every alert in §4 has a runbook in §5
- [ ] Restore from backup tested
- [ ] No secrets in the repo or in `docs/`
- [ ] Every network-exposed endpoint has auth, or a documented exception (SDD §4)
- [ ] Legal copy and policy versions reconciled with the approved contract before launch of new scope (live pages still promise the prior scope); docs-only alignment changes no shipped legal pages
