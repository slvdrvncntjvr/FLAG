---
spine_type: BUILD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.44
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-11-03
reconciled: 2026-10-13
---

# Build guide: FLAG

## 1. Read for the task

Read INDEX, IDEA scope/invariants and the relevant PRD/SDD sections. QAD owns
acceptance coverage; OPS owns deployments. Current LOG is log-current-flag.md;
the Superseded log and archive are not startup reading.

Use Locked requirements or the owner's explicit named-task authorization. The
authorized consolidation and repairs are recorded in the current LOG while docs
remain Review. Old grants and
next-work tables do not automatically authorize a different implementation.

## 2. Pinned stack

Node is **24.22.1**, verified locally 2026-10-31; `.nvmrc` and `web/.nvmrc` are
the pins. Source: https://github.com/nodejs/node/releases/tag/v24.22.1.
`web/.npmrc` enforces the Node 24 engine range. All package pins and overrides
are in `web/package.json` and `web/package-lock.json`; install with npm ci.

The table records local manifest/installed verification, not a new registry or
security audit. Source URLs identify the exact package versions.

| Package | Version | Verified | Source |
|---------|---------|----------|--------|
| next | 16.4.3 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/next/v/16.4.3 |
| react | 19.2.8 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/react/v/19.2.8 |
| react-dom | 19.2.8 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/react-dom/v/19.2.8 |
| @opennextjs/cloudflare | 1.20.12 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/@opennextjs/cloudflare/v/1.20.12 |
| better-auth | 1.7.7 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/better-auth/v/1.7.7 |
| @better-auth/core | 1.7.7 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/@better-auth/core/v/1.7.7 |
| @better-auth/drizzle-adapter | 1.7.7 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/@better-auth/drizzle-adapter/v/1.7.7 |
| drizzle-orm | 0.45.4 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/drizzle-orm/v/0.45.4 |
| zod | 4.6.6 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/zod/v/4.6.6 |
| typescript | 5.9.3 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/typescript/v/5.9.3 |
| tailwindcss | 4.3.3 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/tailwindcss/v/4.3.3 |
| wrangler | 4.149.0 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/wrangler/v/4.149.0 |
| drizzle-kit | 0.31.11 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/drizzle-kit/v/0.31.11 |
| vitest | 4.1.12 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/vitest/v/4.1.12 |
| @cloudflare/vitest-plugin | 1.4.2 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/@cloudflare/vitest-plugin/v/1.4.2 |
| @playwright/test | 1.64.1 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/@playwright/test/v/1.64.1 |
| eslint | 9.39.5 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/eslint/v/9.39.5 |
| eslint-config-next | 16.4.3 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/eslint-config-next/v/16.4.3 |
| resend | 6.32.1 | 2026-10-31, manifest + installed | https://www.npmjs.com/package/resend/v/6.32.1 |
| glob (scoped OpenNext/node-minify override) | 14.0.2 | 2026-11-01, manifest + disposable clean install | https://www.npmjs.com/package/glob/v/14.0.2 |
| minimatch (scoped typescript-estree override) | 11.0.1 | 2026-11-01, manifest + disposable clean install | https://www.npmjs.com/package/minimatch/v/11.0.1 |

Font packages and type packages remain pinned in the manifest/lockfile. Fonts
are local; build does not fetch Google Fonts. Resend's SDK is installed, but
mail uses bounded direct fetch; do not infer active SDK usage from installation.

Scoped compatibility overrides use glob 14.0.2 for OpenNext and node-minify, and
minimatch 11.0.1 for typescript-estree. Legacy lint consumers retain their required
callable/makeRe minimatch API; a global major override is incompatible. Audit
both full and production graphs and keep remaining development advisories visible.
Exact transitive versions and integrity hashes are owned by the lockfile.

Workers compatibility stays 2026-10-01 with nodejs_compat and
global_fetch_strictly_public (`web/wrangler.jsonc:6`). This controls workerd
behavior independently of build Node. Do not change compatibility flags or
upgrade packages as a side effect of documentation cleanup.

### Known API differences

Read `web/AGENTS.md` and relevant installed Next docs under
`web/node_modules/next/dist/docs/`. Use the pinned version's APIs. Route params
and headers are async in the existing app. Better Auth core password-reset
paths need explicit denial despite emailAndPassword.enabled=false; preserve
those hooks and logout-revocation handling (`web/src/server/auth/config.ts:46`).

## 3. Commands

Run from web unless the row says repo root. On Windows PowerShell, use npm.cmd
and npx.cmd if execution policy blocks the .ps1 shims; no policy change needed.

| Task | Command |
|------|---------|
| Install exact lockfile | npm ci |
| Create safe local configuration | node scripts/setup-local.mjs |
| Repair only existing local auth URL | node scripts/setup-local.mjs --repair-url |
| Check local prerequisites | node scripts/check-local.mjs |
| Apply all source migrations to local D1 | npm run db:migrate:local |
| Developer server | npm run dev |
| Typecheck app, integration and browser tests | npm run typecheck |
| Lint | npm run lint |
| Workers tests | npm test |
| Deployment, redirects, harness, observability and migration-generation tests | npm run test:deploy |
| Local setup regression tests | node --test scripts/setup-local.test.mjs |
| Isolated browser suite | npm run test:e2e |
| Slower local full browser run, bounded 30-minute suite budget | npm run test:e2e -- --global-timeout=1800000 |
| Dev Worker build | npm run build:worker:dev |
| Production Worker build | npm run build:worker |
| Packaged local workerd smoke | npm run test:worker:smoke |
| Generate binding types after binding changes | npm run cf-typegen |
| Generate a reviewed migration | npm run db:generate |
| Local SPINE validation, repo root | python scripts/spine.py check docs/ |
| Checkpoint verification, repo root | python scripts/spine.py checkpoint verify |
| Pinned runner tests, repo root | python -m unittest discover -s scripts -p test_*.py |

Local setup uses the approved account ID from wrangler.jsonc when Wrangler
requires account selection. Keep developer secrets and data intact. Console OTP
requires HTTP localhost and both mail keys absent; setting a key sends real mail.
The setup/check scripts print no secrets and preserve existing .dev.vars by
default. See web/README.md for the short setup path.

The isolated browser harness keeps its default 15-minute Playwright suite budget
and 16-minute child wait. An explicit positive integer global-timeout argument
up to 1,800,000 milliseconds extends the enclosing wait by the existing one-minute
completion margin; invalid, duplicate or unbounded values fail before creating
temporary data. Per-test/assertion limits, zero retries and verified teardown
are unchanged. CI keeps its default invocation.

### 3.1 Deploy and migrations

OPS owns remote procedures. The package scripts include db:migrate:dev,
db:migrate:remote, deploy:dev and deploy, but running a local check is not release
authorization. Build and deployment do not apply SQL. Schema 0008 compatibility
with disabled intake covers only the supported private read/query regression
paths, without new writes or 0009-field reads. It is not full-Worker deployment
compatibility. The full pilot Worker needs the current reviewed migrations
before deployment even with intake false; inspect and apply only the compatible
pending set under [OPS §7](ops-flag.md#7-production-readiness-gate).

### 3.2 Encrypted D1 backup command (Windows)

Run from the repo root with installed `web/node_modules` and Node/npm available.
These review commands validate the source configuration against the existing
approved binding guard and print the intended command without exporting data:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/backup-d1.ps1 -Target dev
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/backup-d1.ps1 -Target production
python -m unittest discover -s scripts -p test_backup_d1.py -v
```

`-Mode SelfTest` runs the same synthetic DPAPI/cleanup cases directly, without
Wrangler, developer data or network. The Python suite skips on non-Windows.
Both targets use account `1af65da586efd62d6f6d429240395f28`: dev is
`flag-db-dev` / `54aca5df-2ae7-4150-bd75-0f6365e5bfa3`; production is
`flag-db` / `e196d1b5-82e7-45bf-b1c5-725fa1faf184`. There is no implicit target.

Only after the approved dev prerequisites and target/ledger review in
[OPS](ops-flag.md#6-backup-and-recovery), execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/backup-d1.ps1 -Target dev -Mode Backup -PrerequisitesVerified
```

Production execution additionally requires later owner release approval and
`-Target production -Mode Backup -PrerequisitesVerified -ProductionReleaseApproved`.
These switches attest to approval and prerequisite review; the script cannot
establish either. Preparing or reviewing the command grants no release approval.

The helper invokes the installed Node executable and the absolute project-local
Wrangler entrypoint directly, with an isolated configuration for the validated
target and explicit remote export/environment flags. Redirected native streams
are drained without displaying their content and the actual process exit code
is checked; native stderr cannot become a PowerShell terminating error before
the result is assessed. No packages are installed or upgraded. It encrypts the
SQL bytes with Windows DPAPI CurrentUser (no optional entropy) into a new unique
`.sql.dpapi` in existing `C:/Users/Vincent/FLAG-backups`; optional `-OutputName`
accepts only a new filename there. Existing output is never replaced. SQL and
Wrangler scratch files stay in a private OS temporary directory outside the repo.
The helper disables Wrangler disk logging/telemetry, suppresses subprocess
output and exception content, verifies the written artifact by in-memory decrypt,
length and SHA-256, clears sensitive byte arrays and removes its plaintext in
`finally`. Success emits only target, time, encrypted path and integrity result;
failure exits nonzero and removes an artifact created by the failed operation.

Preserve the original Windows profile for recovery. This verifies encrypted
byte recovery, not SQL restore compatibility, D1/R2 restore, finite backup
disposition or release prerequisites. Forced process/OS termination can interrupt
`finally`; a cleanup-permission failure is a failed backup, never verified
success. Follow OPS for assessed retention and recovery. Export flags were
checked against installed Wrangler 4.149.0 `d1 export --help` and the
[official command reference](https://developers.cloudflare.com/d1/wrangler-commands/#d1-export).

## 4. Repo conventions

- Source: web/src/app routes, features domain/actions/forms, server auth/db/mail.
  Worker integration tests: web/tests; browser tests: web/e2e; Node safety tests:
  web/scripts. Python runner tests: scripts.
- dev is the dev deployment branch; main is production. INDEX records the
  current source baseline and integration state.
- Role/session identity comes from the server. Actions return bounded generic
  failures and useful field errors; no submitted content or provider body logs.
- Parameterize SQL values. Atomic writes recheck live actor/policy/relationship
  state; zero-row races must not commit preceding writes.
- No new entity/column without the SDD ERD first. Published migrations are
  forward-only. Generated binding types follow source Wrangler configuration.
- Update one owning doc when a contract changes; link from other docs. Routine
  test transcripts are not a reason to churn every document.

## 5. Guardrails

IDEA defines all eight invariants; SDD section 5.1 and QAD section 4.1 map their
enforcement and tests: INV-1 human publication, INV-2 accepted engagement/proof,
INV-3 no stored raw ID, INV-4 private proofs, INV-5 approved ratings only,
INV-6 no client publication edits, INV-7 signed-in records, INV-8 verified and
acknowledged filers. Keep their negative cases with every affected change.

Secrets live in ignored .dev.vars/.env files or per-environment Cloudflare
secret storage. Preserve policy versions, real developer credentials/data,
retained evidence and active holds. Never enable real intake before the approved
lifecycle/correction prerequisite. No paid upgrade without owner approval.

## 6. Definition of done

The named task's requirement and source contract agree; relevant checks pass;
changed intent/contracts/commands/status are recorded once; documentation
validation passes. Run checkpoint verification and classify every finding:
the recorded owner-deleted `docs/log-flag.md` finding against
`spine-cp-2026-10-26-1` remains expected and visible; unexpected drift must be
resolved or reported before completion. Do not suppress that finding, restore
history or create a replacement checkpoint to obtain a clean result.
Distinguish local implementation, local tests, independent review, integration,
deployment and human acceptance.
Only claim levels actually observed for the current candidate.

For CI/release coverage see QAD. For a reversible copy/doc change, run its
relevant existing checks; no new ceremony or tests mirroring prose are needed.

## 7. Interface system

Owner direction: civic record. Plain English, factual labels, restrained borders
and small radii; avoid social-feed, gamification and marketing patterns.

- Source Serif 4 for headings/client names, Inter for body/interface, IBM Plex
  Mono for references/counts/dates/amounts. Mobile body base 16px; at most three
  type sizes on one mobile screen. Fonts/tokens: `web/src/app/layout.tsx:5`,
  `web/src/app/globals.css:4`.
- Existing tokens are paper/ink/muted/rule/accent/danger. Approved future outcome
  colors are blue #0072B2, neutral hatched mixed, vermillion #D55E00; always pair
  color with glyph and Positive/Mixed/Negative text. Text contrast at least 4.5:1,
  bar segments at least 3:1. Radius at most 2px; 1px rules instead of shadows.
- Build at 360px with keyboard access, visible focus and clear empty/loading/error
  states. Use dvh/svh, session cookies and appropriate form actions. Target LCP
  <=2.5s, INP <=200ms, task-route JS under 150KB compressed; targets are not
  measured results. Feedback transitions 150-200ms and respect reduced motion;
  no parallax or scroll-linked decoration.
- If library components are needed, the approved direction is shadcn on Base UI;
  neither it nor an animation library is installed now. Do not document planned
  component names or MotionConfig as existing app infrastructure.
- Existing optional Messenger external-browser help is retained as support copy;
  it creates no device or release gate. Availability copy must describe what the
  current product slice offers without claiming unfinished workflows exist.

## 8. Scope references

INDEX owns baseline/remaining work; PRD owns product intent; SDD owns source
contracts; QAD owns verification; OPS owns releases. Do not recreate a second
milestone queue or current-status narrative here.
