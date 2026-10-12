---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.1
status: Draft
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-10-12
reconciled: 2026-10-12
---

# Ops & Observability: FLAG

**SDD:** [sdd-flag.md](sdd-flag.md)

---

Nothing here is deployed yet. Commands are the planned ones from BUILD §3; each is marked verified only after it has been run against a real environment.

## 1. Environments

| Environment | URL | Branch | Deploy trigger | Owner |
|-------------|-----|--------|----------------|-------|
| Production | `TBD(owner)` workers.dev or custom domain (LOG Q4) | `main` | Manual `npm run deploy -- --env production` after the release gate | slvdrvncntjvr |
| Preview | `TBD(owner)` | `dev` | Manual `npm run deploy -- --env preview`; CI deploy `TBD(owner)` | slvdrvncntjvr |
| Local | http://localhost:3000 | any | `npm run dev` | each developer |

Each environment has its own D1 database (`flag-db`, `flag-db-preview`) and R2 bucket (`flag-proofs`, `flag-proofs-preview`). Pilot data never goes into preview.

## 2. Deploy

| Step | Command | Notes |
|------|---------|-------|
| Apply migrations | `npm run db:migrate:remote -- --env production` | Before the code that needs them; migrations are backward compatible |
| Build and deploy | `npm run deploy -- --env production` | OpenNext build, then Wrangler upload |
| Smoke check | Sign in, open a client record, open the moderation queue | Manual, two minutes |

**Rollback:** `npx wrangler rollback --env production` returns to the previous Worker version. D1 migrations are not rolled back; they are forward-only and backward compatible. Last verified: not yet (`TBD(owner)` before the pilot).

## 3. Configuration and secrets

| Name | Purpose | Store | Required |
|------|---------|-------|----------|
| `BETTER_AUTH_SECRET` | Session signing | Wrangler secret | yes |
| `BETTER_AUTH_URL` | Public base URL | wrangler.jsonc vars | yes |
| `GOOGLE_CLIENT_ID` | Google sign-in | wrangler.jsonc vars | yes |
| `GOOGLE_CLIENT_SECRET` | Google sign-in | Wrangler secret | yes |
| `RESEND_API_KEY` | Email | Wrangler secret | yes |
| `TURNSTILE_SITE_KEY` | Bot check widget | wrangler.jsonc vars | yes |
| `TURNSTILE_SECRET_KEY` | Bot check verify | Wrangler secret | yes |
| `ID_HASH_KEY` | HMAC key for `id_hash` (RFC 001) | Wrangler secret; offline backup held by the owner | yes |
| `PHILSYS_ED25519_PUBLIC_KEY` | PhilID signature check | wrangler.jsonc vars | yes |
| `SMS_API_KEY` | Phone codes; provider `TBD(owner)` | Wrangler secret | yes |
| `DB` | D1 binding | wrangler.jsonc | yes |
| `PROOFS` | R2 binding | wrangler.jsonc | yes |
| `RATE_LIMIT_AUTH`, `RATE_LIMIT_WRITE` | Rate Limiting bindings | wrangler.jsonc | yes |

Values are never recorded in this document or any other doc in `docs/`. Local values live in `web/.dev.vars`, which is gitignored.

## 4. Monitoring

| Signal | Source | Threshold | Alert |
|--------|--------|-----------|-------|
| Overdue moderation cases | Queue page header count | Any case open over 36 hours | Shown to moderators in the queue; checked at the daily team stand-up |
| Worker errors | Workers Observability | More than 1 percent of requests over 15 minutes | Cloudflare notification email to the owner |
| Email delivery failures | Resend dashboard | Any bounce on invites | Checked weekly |
| D1 storage | Cloudflare dashboard | 400 MB (free tier limit 500 MB) | Checked weekly |

### 4.1 Logging

| Level | Used for | Destination | Retention |
|-------|----------|-------------|-----------|
| error | Unhandled exceptions with request id and route | Workers Observability | Cloudflare default |
| info | Moderation decisions, sign-ins, ID check result codes (ids only) | AUDIT_EVENT table | Life of the product |

Never log secrets, tokens, request bodies, names, phone numbers, ID data, or proof contents.

## 5. Runbooks

### Overdue moderation cases

**Symptom:** queue shows cases older than 36 hours.
**Likely cause:** moderators unavailable; spike in submissions.
**Diagnose:** open `/moderation`, sort by waiting time.
**Fix:** project manager reassigns moderators for the day; claims older than 30 minutes are released automatically.
**Escalate to:** project manager.

### Worker error rate

**Symptom:** Cloudflare notification of elevated errors.
**Likely cause:** a bad deploy or a failing migration.
**Diagnose:** `npx wrangler tail --env production` and the Observability dashboard.
**Fix:** `npx wrangler rollback --env production`; if the cause is a migration, ship a forward fix.
**Escalate to:** slvdrvncntjvr.

### Personal data breach suspected

**Symptom:** proof or account data exposed to someone who should not see it.
**Likely cause:** an authorization bug or a leaked credential.
**Diagnose:** AUDIT_EVENT for the affected rows; Worker logs for the routes involved.
**Fix:** rotate affected secrets; patch and redeploy. Notify the data protection contact immediately. NPC Circular 16-03 sets a 72-hour notification window for the NPC and affected people.
**Escalate to:** data protection contact `TBD(owner)` (LOG Q5).

## 6. Backup and recovery

| What | Frequency | Location | Restore tested |
|------|-----------|----------|----------------|
| D1 | Continuous (D1 Time Travel, 30 days on paid, 7 on free) | Cloudflare | not yet |
| D1 export | Weekly during the pilot (`wrangler d1 export`) | Owner's encrypted drive | not yet |
| R2 proofs | None beyond R2 durability | Cloudflare | n/a |

## 7. Production readiness gate

- [ ] Rollback tested within the last 14 days
- [ ] Every alert in §4 has a runbook in §5
- [ ] Restore from backup tested
- [ ] No secrets in the repo or in `docs/`
- [ ] Every network-exposed endpoint has auth, or a documented exception (SDD §4)
