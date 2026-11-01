---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.40
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-11-01
reconciled: 2026-10-13
---

# Operations: FLAG

## 1. Environments

Source: `web/wrangler.jsonc:1`, `web/scripts/check-resource-bindings.mjs:4`.
Last recorded live versions and migration ledgers are in INDEX section 6.

| Environment | URL | Branch | Worker / D1 / private R2 |
|-------------|-----|--------|--------------------------|
| Dev | https://flag-dev.factsfirst.workers.dev | dev | flag-dev / flag-db-dev / flag-proofs-dev |
| Production | https://flag.factsfirst.workers.dev | main | flag / flag-db / flag-proofs |

The approved account is fixed in Wrangler configuration and binding guards.
Each environment has separate data and secrets. dev-2 is a local working branch;
it adds no environment. The pilot stays within free allowances; owner approves
any spend. No automatic spend cutoff is implemented.

## 2. Deploy

Normal route: Workers Builds, repository root web, separate build/deploy fields:

| Worker | Build | Deploy |
|--------|-------|--------|
| flag-dev | npm run build:worker:dev | npm run deploy:worker:dev |
| flag | npm run build:worker | npm run deploy:worker |

Do not place a combined deploy script in the build field. Builds use web/.nvmrc;
any dashboard NODE_VERSION override must agree. Source target guards reject
wrong CI branch/Worker/bindings (`web/scripts/check-ci-target.mjs:18`). This is
configured behavior, not a claim this task inspected dashboard settings.

Owner-authorized CLI fallback: npm run deploy:dev or npm run deploy from web.
Deploy does not migrate D1. After any release, verify actual DB/PROOFS/auth URL
bindings against the selected environment, check CI and perform manual smoke:
sign in, accept current policies, open /home and use the shipped slice;
signed-out /home and /onboarding redirect to /sign-in; anonymous proofs deny.

Worker rollback leaves schema/data unchanged. Select a known compatible version
from recorded evidence; a D1 restore is a separate owner decision. Historical
rollback/restore receipts are in the Superseded log, not fresh release evidence.

## 3. Configuration and secrets

| Name | Purpose | Store |
|------|---------|-------|
| BETTER_AUTH_SECRET | Session/auth secret | Per-environment Worker secret; local ignored .dev.vars |
| BREVO_API_KEY / RESEND_API_KEY | Preferred/fallback sign-in mail | Per-environment secret; never print values |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Optional configured OAuth | Per-environment secret |
| BETTER_AUTH_URL, MAIL_FROM | Origin and sender | Source Wrangler vars; local URL override |
| PRIVATE_INTAKE_ENABLED | Exact-string server rollout switch | Source/environment vars, false by default |

Do not paste secrets into docs, CLI arguments, examples or reports. Only actual
HTTP localhost may use console OTP with both mail keys absent. Provider acceptance
is not proof of inbox delivery.

## 4. Monitoring

| Signal | Current evidence/source | Action |
|--------|-------------------------|--------|
| Verification waiting age | Queue shows cases past 36h; 48h target | Daily moderator check, reassign expired leases |
| Worker errors | Fixed application events emitted; persisted Workers logs/traces disabled; >1%/15min target alert not configured | Owner investigates with bounded content-free diagnostics and platform metrics |
| Mail failures | Generic application 503 and provider dashboards | Check sender/key/provider availability without copying contacts/codes |
| Free usage/storage | Owner checks dashboard weekly and before intake | Compare Workers/D1/R2 usage and storage with current allowances; stop before paid upgrade |
| Correction turnaround and full retention | Workflows/signals not implemented | Add actual case-close/hold and deletion evidence with those features |

Application log emission remains enabled. Default and dev source configurations
explicitly disable invocation logs, log persistence, traces and trace persistence;
no export destination, Tail consumer or Logpush is configured. Automatic alert
routing is not configured. No uptime or monitoring readiness is inferred from this.

### 4.1 Logging

Audit rows contain actor/subject IDs, server-owned action and time only.
Never log tokens, OTPs, provider bodies, contacts/IDs, facts, files or raw request
bodies. PRD-F12 owns minimal-history retention; full maintenance is unfinished.

Invitation capabilities appear in request paths. Invocation suppression alone
does not establish that custom-log metadata omits those URLs, so source disables
platform persistence as well. This sacrifices stored console diagnostics while
keeping fixed application events available to deliberately controlled local or
real-time diagnosis. Real-time log/tail sessions can expose request metadata;
do not retain or copy capability URLs. Do not reenable persistence, tracing or
exports without a verified capability-safe logging design.

These are source settings for a future deployment. Hosted overrides and actual
logs were not inspected; the repair does not delete previously retained records.
The owner must assess historical retention/access and any external destinations
through authorized operations without copying live tokens into reports.

## 5. Runbooks

### Enable private intake on dev

1. Complete and verify the minimum safe lifecycle/correction capabilities in
   PRD-F12/PRD-F13. Use synthetic data while developing them.
2. Back up dev D1. Review/apply pending migrations starting at 0009, including
   prerequisite lifecycle/publication additions. Never edit published SQL.
3. Update privacy/terms to describe the newly available processing and bump
   their source policy versions when that meaning changes.
4. Enable the server flag only in the intended dev environment, deploy the
   reviewed candidate and run the shipped-slice smoke/owner check.

A source flag change alone is insufficient. Existing private reads stay
relationship-authorized while intake is off. An unexplained purge_inflight owner
must be investigated; never take over its R2 deletion on a timer.

### Privacy requests and retention

CONTACT_EMAIL in `web/src/lib/policies.ts:5` is the receiving channel. The named
owner must process and record request responsibility, assessment and outcome;
this address does not establish that an export/deletion/closure tool exists.
Complete the minimum safe lifecycle before collecting real proofs or publishing.
Hiding or read-time expiry alone is not physical erasure. Preserve documented
holds and decided-row evidence until a controlled assessed purge is designed.

### Failures and overdue work

For mail failure, check configured provider/sender and the generic error, then
retry the intended sign-in. For overdue verification, check the actual live lease
before reassignment; a replacement reviewer reinspects. For suspected private
material exposure, preserve evidence, restrict the affected surface and notify
the owner through the user's authorized channel. Full correction and retention
incident procedures land with their unfinished workflows.

## 6. Backup and recovery

Before remote migration, take a target D1 export into the owner's existing
C:/Users/Vincent/FLAG-backups location using the established encrypted process.
Keep the original Windows profile required for DPAPI CurrentUser recovery.
Historical D1 and synthetic R2 restore checks are recorded 2026-10-26 in the
Superseded log; this task did not repeat them. Never infer production recovery
or safe SQL rollback merely from a local test.

Historical local evidence was verified into
flag-local-evidence-20261030T162702Z.zip.dpapi in that backup directory. Its
__FLAG_ARCHIVE_MANIFEST__.json records original paths, sizes and SHA-256 hashes.
It is separate from D1 backups and unnecessary to build/test/run this app.

## 7. Production readiness gate

A main merge triggers production deployment. The owner chooses promotion after
green CI and manual smoke for the intended slice. Back up production, apply
reviewed pending migrations dev first, deploy, verify actual bindings and policy
reacceptance. The last recorded production baseline predates PROOFS; a promotion
must include the configured private binding.

Keep the approved real-intake prerequisite. Do not revive dropped billing-tier
proofs, exact release-identity gates, production recovery drills, purge-owner
recovery gates, extra device/Messenger gates or additional main-approval flows
from historical proposals. A destructive restore remains its own owner decision.
