---
spine_type: OPS
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.44
status: Review
owner: slvdrvncntjvr
created: 2026-10-12
updated: 2026-11-02
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
Each environment has separate data and secrets. dev-2 is a source branch;
it adds no environment. The pilot stays within free allowances; owner approves
any spend. No automatic spend cutoff is implemented.

The owner's 2026-11-02 authorization covers remaining pilot implementation,
backed-up dev migrations/deployment and synthetic intake after prerequisites
under Review docs. Keep intake disabled during implementation. Promotion to main
requires the owner's later approval. This procedure neither enables real pilot
proof collection automatically nor adds optional features or paid upgrades.

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

### 2.1 Stage the remaining pilot on dev before main

Use QAD sections 1.1–1.2 and 7.1 for executable acceptance and missing coverage.
The commands below are existing package scripts verified against
`web/package.json:8`; they were not executed by this documentation task. Run from
web with npm.cmd on PowerShell where needed. Future lifecycle/export/maintenance
operator commands must be supplied and exercised by their implementation owner;
no guessed command or bare SQL override is a supported operating procedure.

1. Finish the SDD schema/transition contract and additive migrations before
   applying SQL. Preserve published migration bytes, snapshots, old consent and
   decision evidence. Test upgrades from actual 0008/0009 fixtures; do not infer
   production's ledger from dev. In particular 0009 blocks publication today;
   only reviewed later migrations may replace its guards with the controlled
   moderation/maintenance path. Retained rows must remain readable by the chosen
   compatible application through deployment order.
2. Keep actual dev intake `"false"`. Run the existing BUILD checks plus the new
   QAD cases for the intended slice; verify candidate CI. Check dev's actual
   migration ledger, take and verify its encrypted backup as in section 6, then
   apply the compatible reviewed pending set with `npm run db:migrate:dev`.
   This applies all pending files; inspect that set before execution. Migration
   failure requires ledger/data inspection, not blind rerun or SQL rollback.
3. Deploy dev through normal Workers Builds (section 2), or the already
   authorized fallback `npm run deploy:dev`. A successful build/deploy does not
   establish migration, binding, scheduler or acceptance success. Confirm actual
   settings with section 2.2 and execute affected disabled-intake/authorized-read
   smoke checks before enabling writes.
4. Verify minimum safe assessed requests, export/closure, independent correction,
   physical D1/R2 erasure and documented holds. Exercise the actual deployed
   maintenance mechanism with synthetic due rows; record failures/retries and
   confirmed erasure. Read hiding alone is not this prerequisite. Update
   applicable privacy/terms text and versions when processing changes and check
   current-policy reacceptance without rewriting old receipts.
5. Only after prerequisites, enable the intended dev server flag for synthetic
   intake and run QAD section 7.1 on synthetic accepted engagements/proofs,
   publication, corrections, records and ratings. Record observed results once.
   The flag enables writes globally for eligible verified dev users; it is not
   a synthetic-account allowlist. Use clearly synthetic accounts/proofs, do not
   verify/admit real proof filers during this phase, and keep the enabled test
   window under staff control. If existing eligible real accounts make that
   boundary unmanageable, leave intake false and have the coordinator resolve
   containment before enabling it. Disable intake if safety fails; preserve
   authorized evidence for assessed handling. Enabling dev is not enabling
   production or authorizing real data; separate manual acceptance precedes
   real pilot proof collection.
6. Report dev outcomes, remaining defects and candidate CI/manual smoke to the
   owner. Main remains unchanged until later promotion approval. Section 7 owns
   the production sequence after that approval; do not apply production SQL or
   change production settings as an incidental dev step.

### 2.2 Verify actual deployed configuration

The operator inspects the selected deployed Worker's settings/binding metadata
through the established Cloudflare access, not merely the source file or a local
dry-run. Record environment/time, names, ledger and pass/fail without secret
values, capability paths or retained log content.

| Check | Expected for the selected environment |
|-------|---------------------------------------|
| Target and private bindings | Dev: flag-dev / DB=flag-db-dev / PROOFS=flag-proofs-dev / dev auth origin; production: flag / DB=flag-db / PROOFS=flag-proofs / production auth origin. Match actual D1 IDs to source binding guards, not name alone |
| Schema and compatibility | Actual migration ledger matches the reviewed required set; existing and newly shipped reads/actions work; deployment did not rewrite historical SQL/data |
| Proof privacy | No public R2 domain/access; anonymous and unrelated/bare-admin proof requests return 404/no-store; authorized reads still work while intake is off |
| Intake | Actual server value is exact string false during implementation; no new draft/upload/edit/submit writes; exact true only for intended post-prerequisite dev synthetics |
| Auth/policies | Actual BETTER_AUTH_URL matches target; secret names exist without printing values; sign-in/current-policy reacceptance works; historical engagement consent unchanged |
| Logging | Invocation logs false, logs.persist false, traces.enabled/persist false; no export destinations, Tail consumers or Logpush; fixed application events remain content-free |
| Maintenance | Actual deployed scheduled/internal mechanism exists and has bounded authority; due synthetic D1/R2 data erased with content-free completion/retry evidence; no public purge route |

Source observability tests intentionally assert disabled intake in both source
environments (`web/scripts/observability-safety.test.mjs:63`). When enabling the
approved dev phase, update the affected rollout/config expectations to reflect
that phase while preserving production false and logging/privacy assertions;
do not suppress a failing guard or treat an obsolete assertion as product intent.

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
| Worker errors | Fixed application events emitted; source disables persisted logs/traces; deployed observations in INDEX; >1%/15min target alert not configured | Owner investigates with bounded content-free diagnostics and platform metrics |
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

INDEX records deployment and settings observations per environment. A settings
check does not inspect retained log content, and deploying the source repair
does not delete previously retained records. Historical retention/access and any
external destinations require an authorized assessment without copying live
tokens into reports.

## 5. Runbooks

### Enable private intake on dev

Follow section 2.1 in order. PRD-F12/PRD-F13 are the existing minimum safe
lifecycle/correction prerequisite. New feature implementation and dev synthetics
are authorized; production promotion and real proof intake are not automatic.

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

When implemented, the processor records requester/subject, kind, responsible
staff, assessment, action and outcome using the SDD-defined workflow. For
closure, assess within 30 days, deactivate and revoke sessions/access without
cascade-deleting retained evidence. Retain a published filer's name only under
the assessed lawful purpose; earlier required erasure first hides/withdraws the
publication and recalculates the record. Export uses the SDD section 3.10
allowlist, per-file subject relationship checks and private delivery: ordinary
verified-subject session plus hashed one-use capability, or a separately
assessed post-closure export-only capability. Maximum lifetime is 24 hours; a
closed account is never reopened to deliver it. The issuing admin does not
receive proof bytes, choose another recipient or automatically email a secret
link. Recheck subject/channel, no-store/nosniff attachment delivery, one-use
refusal and confirmed artifact erasure before marking work done. Receipt of
email is neither authentication nor delivery.

Physical maintenance uses the SDD-defined internal/scheduled authority. It must
not use raw unguarded DELETE or disable freeze/hold triggers. Claim eligible
work atomically, delete exact scoped R2 objects, confirm result, then retire
eligible D1 children/parents in dependency order with retry tracking. Preserve
minimal per-case history until its own deadline. An R2 failure, changed identity
or uncertain in-flight owner is incomplete work, never confirmed erasure.
The bounded existing draft helper at
`web/src/features/logs/cleanup.ts:7` is not a full retention scheduler or privacy
processor. New operator entry points remain unavailable until implemented and
exercised; this plan does not claim a Cron or export tool currently runs.

SDD section 3.11 targets an hourly scheduled Worker calling the same bounded
runner as staff retry: at most 25 task claims and 25 R2 deletes per run. Once
implemented, check actual cron configuration and packaged scheduled-handler
behavior, last run/result and due backlog. Reads/downloads deny exactly at their
deadline; physical destruction is due on the next hourly sweep. Failed or held
work remains explicitly tracked. A server helper without a deployed executor
does not meet this contract. No maintenance CLI command is currently supplied.

| Selector | Required operation |
|----------|--------------------|
| Published/withdrawn material | Original publication plus 12 months; approved updates/corrections never restart it; every record read excludes expired material before maintenance |
| Idle draft/unpublished ask-changes | 30 days inactive; close abandoned case before purge; activity must not be fabricated by background retry |
| Rejected material | 30 days from final decision; keep only separately due minimal case history afterward |
| Abandoned proposed update | Purge only unapproved revision and exclusively owned proofs; preserve shared/active publication evidence and inherited expiry |
| Verification/moderation/correction/audit history | Minimal receipt for 12 months from its own actual case close; account activity/later cases do not grant indefinite retention |
| Policy acceptances | Current gate while purpose is active; retired rows expire 12 months after policy/purpose end or account closure |
| Review/legal hold | Document scope, responsible person, reason and bounded review/end; delay private deletion only, never record visibility/ratings; re-evaluate eligible purge on release/expiry |

Use SDD's exact date arithmetic; QAD tests normal/leap/month-end deadlines,
holds and failure races. Do not translate 12 months into a 365-day constant.

### Correction and publication follow-up

Only an authorized unconflicted moderator with a live 30-minute claim may
publish after checking the engagement/event/rating against approved proof and
recording a reason. Ask-changes preserves on-time initial eligibility and all
rounds; no anchor/publication clock reset. Queue waiting age is oldest first,
overdue after 36 hours; review target is 48 hours.

A named client's private request alone does not hide a publication. Record a
credible error/privacy assessment for temporary hiding; opinion disagreement is
not removal. Corrections use an independent reviewer other than the original
log decider; reject filer/client/engaged reviewer conflicts. Record uphold,
ask-changes, correct or withdraw and private history. Filer proposals appear only
after approval, with dated metadata and the original expiry. Monitor correction
age against the 48-hour target. On stale/conflicting decisions inspect the
winning current round; never repair by overwriting decided evidence.

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
Match the target database/ledger before exporting. Encrypt through the existing
DPAPI CurrentUser process; verify that the encrypted artifact decrypts to the
export's bytes/hash in controlled local memory or protected temporary handling,
then remove only this operation's plaintext after verification. Record backup
time, target, path and nonsecret integrity result, never data contents or keys.
Do not leave the raw export in the repository, docs or reports. Use the implemented
Windows helper and review/execution commands in [BUILD §3.2](build-flag.md#32-encrypted-d1-backup-command-windows).
Its default is a local target/command review; synthetic DPAPI/cleanup tests perform
no remote export. Actual dev execution uses the already approved conditional
authorization only after the prerequisite checks; production execution remains
within the later owner-approved release. No remote backup ran during tooling
preparation, and encrypted byte verification does not establish restore safety.

Backups are part of assessed erasure: record affected artifacts, finite expiry/
deletion or documented bounded hold, responsible processor and actual result.
Before a future authorized restore becomes accessible, reapply outstanding
erasure/closure decisions so old backup bytes cannot resurrect access or visible
publications. Keep export/backup disposition receipts minimal and finite under
the SDD contract. This adds no production restore drill or new recovery gate.
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

For this pilot, get the later owner main-promotion approval after dev acceptance.
Inspect production's actual ledger, take/verify its encrypted backup, and apply
only the compatible reviewed set already exercised on dev with
`npm run db:migrate:remote` from web. Normal main deployment follows section 2;
the explicitly authorized fallback is `npm run deploy` only when included in
that promotion scope. Recheck section 2.2 on production, then perform the
intended-slice smoke and policy reacceptance. Keep production intake false unless
the owner separately authorizes its intended activation after prerequisites.
The new pilot Worker requires the reviewed lifecycle columns and guards before
it starts: migrate first, then deploy. A private-query capability fallback does
not make the new authentication/onboarding code work against 0007/0008.
The previous 2026-11-01 Worker tolerates the additive nullable columns, but its
older privacy/terms versions cannot satisfy the new database policy authority.
It is a limited fail-closed fallback: new onboarding and staff mutations may be
unavailable. It is not a verified full pilot rollback. A release must identify a
version compatible with the final schema and current policy before using it.

If a release fails, stop new intake and select a known schema-compatible Worker
version; never claim a Worker rollback undoes migrations or deletions.

Keep the approved real-intake prerequisite. Do not revive dropped billing-tier
proofs, exact release-identity gates, production recovery drills, purge-owner
recovery gates, extra device/Messenger gates or additional main-approval flows
from historical proposals. A destructive restore remains its own owner decision.
