# FLAG — web

Next.js (App Router) on OpenNext + Cloudflare Workers, D1 (Drizzle), Better Auth.
Pilot target: Cloudflare Workers Free plan and Brevo's free email allowance.
See `../docs/index.md` for the current scope, release status, and limitations.

## Agent and contributor starting point

Read `../AGENTS.md`, then `../docs/index.md` and the upstream documents for the
feature. This repo stays on **SPINE 0.3.0**. From the repo root, use:

```bash
python scripts/spine.py engine
python scripts/spine.py check docs/
python scripts/spine.py checkpoint verify
```

The runner uses the local engine's `v0.3.0` tag without changing the shared
checkout, even if that checkout has been upgraded. `SPINE_HOME` can point at a
local clone containing that tag. No application or documentation command needs
the repo's disposable `temporary/` folder. Other features require their own
scope/authorization; passing the baseline checks does not make the full product
implemented. Accounts/onboarding and manual verification/review are deployed to dev through migration 0007. PR17 repairs auth profile privacy, numeric portfolio URLs and historical request attribution; its immutable snapshots preserve new case inputs and mark legacy originals unavailable. Local checkpoint spine-cp-2026-10-26-1 captures the verified integrated application. See INDEX section 6 for current candidate/release evidence and OPS section 7 for production prerequisites. Main/production promotion remains held; a scoped dev checkpoint is not full-product acceptance.

## Local development

Use Node **24.22.1**, pinned in the repository and `web/` `.nvmrc` files. With
nvm (including nvm-windows), run `nvm install 24.22.1` and `nvm use 24.22.1`
before installing dependencies. `web/.npmrc` enforces the Node 24 requirement in
`package.json`; it rejects older runtimes during installation. `nvm use` changes
the shared Windows symlink: wait for other workers to finish before switching.
Until then, select the verified portable runtime for this PowerShell session:

```powershell
$flagNodeDir = Join-Path $env:TEMP 'flag-review-node-v24.22.1/node-v24.22.1-win-x64'
$env:Path = "$flagNodeDir;$env:Path"
node --version # must print v24.22.1
npm --version
$env:CLOUDFLARE_ACCOUNT_ID = '1af65da586efd62d6f6d429240395f28'
```

The portable directory is an existing local review runtime, not a permanent
installation. For durable setup, install with `nvm install 24.22.1`, then run
`nvm use 24.22.1` once shared workers finish; verify in a fresh terminal.
Set the approved account explicitly in each development shell (Bash:
`export CLOUDFLARE_ACCOUNT_ID=1af65da586efd62d6f6d429240395f28`). Remove a
conflicting legacy `CF_ACCOUNT_ID` from that shell. Account IDs are identifiers,
not API credentials; keep tokens in the existing Wrangler login/secret store.
Wrangler D1 commands can require account selection even for `--local`; multiple
memberships cannot be selected interactively in unattended runs. The existing
Wrangler configuration pins this same approved account; do not change production
settings or choose a different account to bypass an error.

```bash
cd web
npm ci
node scripts/setup-local.mjs # create if absent; otherwise preserve the file
node scripts/setup-local.mjs --repair-url # existing file: change only auth URL
node scripts/check-local.mjs # fail early on runtime, URL, secret or account errors
npm run db:migrate:local   # apply drizzle migrations to the local D1
npm run dev                # http://localhost:3000
```

Sign-in uses a 6-digit email code. With no email key set, the code is printed to
the dev-server console (look for `[dev] sign-in code for ...`). `.dev.vars` holds
local secrets; `BETTER_AUTH_SECRET` is required, email keys are optional.

The setup script reads `local-config.example` and sets
`BETTER_AUTH_URL=http://localhost:3000`. This override is required: the Wrangler
default URL targets production and intentionally disables console OTPs. The
script leaves an existing `.dev.vars` unchanged by default. Explicit
`--repair-url` changes/adds only the URL assignment and preserves every other
byte, including existing secrets and provider keys; repeated runs do not rotate
the secret. Both local scripts support single-line dotenv assignments with
single, double, or backtick quotes and trailing comments; hashes inside quotes
remain part of the value. Duplicate assignments, malformed quoting, and multiline
values fail for manual resolution before any repair writes. Preserve mail
keys: when present, OTP uses real email rather than the console. Console OTP is
available only on HTTP localhost with both provider keys absent. Never commit
`.dev.vars` or copy credentials into the example. The readiness check reads only
local settings and prints no secret values; it does not prove provider delivery,
Cloudflare permissions, or migration state. Run its focused regression checks with
`node --test scripts/setup-local.test.mjs` under Node 24.22.1.

## Local browser E2E

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright is pinned to 1.64.1 (verified with `npm view @playwright/test version`
on 2026-10-21). The runner creates an OS temporary app copy, links installed
dependencies, generates a synthetic secret, and applies migrations to a fresh
local D1 with isolated local R2. It never reads developer `.dev.vars`, `.env`
files, or existing `.wrangler` data; mail/Google credentials are absent. Port
3000 must be free. It starts the server automatically and stops its process tree
and deletes temporary data after the finite suite, including failure.

The suite runs on desktop and 360px Chromium. Accounts scenarios cover anonymous redirects/noindex, real localhost console OTP and D1 sessions, both roles, required policy/freelancer acknowledgments, network recovery, failed sign-out retaining the session and successful revocation. Verification scenarios cover role boundaries, request/queue/claim/inspection/approval, and rejection followed by corrected resubmission with the original review retaining its own name/city/portfolio. Numeric project URLs are exercised through the actual form. The runner uses Next development mode and isolated local D1/R2; it does not prove real mail, Google OAuth, authenticated packaged/deployed workerd or physical-device behavior.

OTPs stay in a restricted temporary file and are removed at teardown. Traces and
screenshots are disabled to avoid retaining codes/cookies. Failure reports are
ignored by Git and may contain synthetic account details; do not publish them.

To exercise the real Workers runtime instead of the Next dev server:

```bash
npm run preview            # opennextjs-cloudflare build && preview
```

Inter, Source Serif 4, and IBM Plex Mono come from pinned Fontsource packages
through next/font/local. Builds need no Google Fonts request. Font licenses
are included in public/font-licenses/.

## Checks

```bash
npm run test        # Vitest in the Workers pool; current results in QAD
npm run test:deploy # Deployment isolation, release identity and R2 audit policy
node --test scripts/setup-local.test.mjs # Local setup safety
npm run build:worker:dev
npm run test:worker:smoke # Built artifact in local workerd, synthetic D1/R2
npm run typecheck   # tsc for app + integration tests + browser tests
npm run lint        # eslint (ignores .open-next and .wrangler build output)
```

## Email (free, no domain required)

FLAG sends transactional email through **Brevo** (free tier: 300 emails/day, no
custom domain needed). `sendMail` picks a provider by which key is present:
`BREVO_API_KEY` → Brevo, else `RESEND_API_KEY` → Resend. With neither key,
deployed OTP requests return HTTP 503; only actual HTTP localhost development
may print a code. Authentication requests are durably limited in D1; OTP send
and verification each allow five attempts per fifteen minutes per trusted IP
and normalized email. Keys are hashed; raw IP/email is not stored in the
rate-limit table.

Provider rejection, timeout, or network failure returns HTTP 503 with a generic
retry message; it never reports successful delivery. Brevo and Resend requests time out
after ten seconds. HTTP success means the provider accepted the request, not a
guarantee that the recipient's inbox received it. Tests simulate provider errors
without sending email.

Set up once:

1. Create a free account at brevo.com.
2. **Senders & IP → Senders**: add and verify the From address (click the email
   Brevo sends you). This must match `MAIL_FROM` in `wrangler.jsonc`.
3. **SMTP & API → API Keys**: create a key. This is `BREVO_API_KEY`.

## Environments

| Environment | Branch | Worker | URL | D1 |
|-------------|--------|--------|-----|-----|
| Production | `main` | `flag` | https://flag.factsfirst.workers.dev | `flag-db` |
| Preview | `dev` | `flag-dev` | https://flag-dev.factsfirst.workers.dev | `flag-db-dev` |

The pilot targets Cloudflare Workers Free-plan limits. The preview environment has its own
database so testing never touches production data. Secrets are **per
environment** — setting a secret on prod does not set it on preview.

## Deploy to Cloudflare (free plan)

Deploys happen automatically through **Workers Builds** (Git-connected):

- Push to `main` → builds and deploys **production**.
- Push to `dev` → builds and deploys **preview**.

### One-time dashboard setup (Workers Builds)

Connect the repository separately to `flag` and `flag-dev` in the Cloudflare
dashboard → Workers & Pages → each Worker → Settings → Builds:

1. Connect the GitHub repo `slvdrvncntjvr/FLAG`, root directory `web`.
2. Set the production branch and separate build/deploy commands as follows:

   | Worker | Production branch | Build command | Deploy command |
   |--------|-------------------|---------------|----------------|
   | flag | main | npm run build:worker | npm run deploy:worker |
   | flag-dev | dev | npm run build:worker:dev | npm run deploy:worker:dev |

3. Disable non-production branch builds unless deliberately configured with
   a preview/upload command for that Worker. Do not put `npm run deploy` or
   `npm run deploy:dev` in the build field: those scripts deploy as well as
   build, and a subsequent default deploy can overwrite the dev bindings.
4. Set runtime variables/secrets through Wrangler, per environment:
   `BETTER_AUTH_SECRET`, `BREVO_API_KEY`. (`BETTER_AUTH_URL` and `MAIL_FROM`
   come from `wrangler.jsonc`.)

Workers Builds reads `web/.nvmrc` because its configured root is `web/`. Keep any
dashboard `NODE_VERSION` build override absent or set to `24.22.1`. This is a
build setting; do not put it in Wrangler runtime `vars`.

The deployed application runs in Cloudflare's `workerd` runtime. Its existing
`compatibility_date: "2026-10-01"` and `nodejs_compat` flag control Worker API
behavior independently of the build Node version. Updating Node does not
require changing either setting.

### Per-environment secrets (if deploying by CLI)

```bash
# production (top-level env)
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BREVO_API_KEY

# preview
npx wrangler secret put BETTER_AUTH_SECRET --env dev
npx wrangler secret put BREVO_API_KEY --env dev
```

### Database migrations

Apply migrations before code that needs them. Dev has 0000-0007 applied; nullable immutable request snapshots in 0007 preserve new inputs without inventing legacy evidence or rewriting published files. Production has only 0000-0002. OPS section 7 requires recovery/preflight and the complete reviewed pending sequence before a main merge triggers deployment; populated dependent logs can prevent 0005 from rebuilding safely. Never delete real data to make that migration pass. Deployment commands do not migrate databases.

```bash
npm run db:migrate:remote   # production flag-db
npm run db:migrate:dev      # preview flag-db-dev
```

### Manual deploy (fallback, not the normal path)

```bash
npm run deploy       # production
npm run deploy:dev   # preview
```

After every deployment, verify the deployed version's actual `DB`, `PROOFS`, and
`BETTER_AUTH_URL` bindings. Dev must use
`flag-db-dev`, `flag-proofs-dev`, and `https://flag-dev.factsfirst.workers.dev`; production uses
`flag-db`, `flag-proofs`, and `https://flag.factsfirst.workers.dev`. The deploy scripts reject a
CI Worker-name override that disagrees with the selected environment.

The OpenNext configuration also rejects CI operations for `flag` outside
`main`, for `flag-dev` outside `dev`, and when the CI Worker name disagrees with
the selected environment. This covers direct adapter commands as well as the
scripts. Incorrect dashboard commands produce a failed check until corrected.
Wrangler's custom build also checks the target before upload, covering a
plain default `wrangler deploy` that bypasses the adapter configuration.

After a separately authorized dev deployment, capture its full Worker version
UUID and verify that candidate explicitly:

```bash
npm run verify:dev -- --expected-version <full Worker UUID>
# Explicit current-health inspection only; does not verify a candidate:
npm run verify:dev -- --health-only
```

Missing/malformed/duplicate/unknown arguments fail before authentication or
requests. A historical candidate, split traffic, ambiguous/missing metadata or
wrong active version fails closed. The verifier checks actual bindings,
anonymous routes, policy/noindex boundaries and invalid-code throttling without
sending mail or creating an account. It rechecks the original active version
before invalid-code probes and after the run; an observed deployment change
fails without release-success output. Health-only mode always reports identity
unverified. Metadata observations cannot lock deployment, prove every request's
version or establish source-SHA provenance. Existing Wrangler login supplies
read-only deployment metadata; this local candidate does not deploy.

The released privacy and terms versions are `2026-10-26`; existing accounts must accept those policies again after release. Legal pages describe current manual verification/profile/review collection and distinguish planned engagement/log/correction workflows. Freelancer acknowledgment and per-engagement client-consent versions are unchanged.

## Not yet enabled (optional, also free when configured)

- **Google sign-in** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google
  Cloud OAuth). Email-code sign-in works without it.
- **Turnstile bot check** — needs site/secret keys (requires a domain). Sign-in
  uses durable D1 rate limits meanwhile (`cf-connecting-ip` plus email).
Manual freelancer verification is implemented; future engagement, log, proof-serving, publication, records, corrections and retention workflows remain separate milestones. The verified-freelancer guard checks the live profile plus current acknowledgments rather than granting access from a cached label.

## Dependency audit evidence

Historical pre-repair evidence on 2026-10-26: the isolated baseline's clean `npm ci` passed under Node
24.22.1/npm 11.19.1. Fresh `npm audit --json` and
`npm audit --omit=dev --json` both returned zero findings. The manifest and lock
select OpenNext Cloudflare 1.20.12 with AWS adapter 4.1.11 and retain Next 16.4.3;
no unsupported-version bypass, forced downgrade or advisory suppression is used.
This supersedes the historical October 14 braces finding for the current lock;
CI rechecks the graph as advisories change. Other local/hosted/release evidence
and remaining limitations are recorded separately in QAD/OPS.

## Offline recovery preparation

From the repository root:

```bash
python -m unittest discover -s scripts -p 'test_*.py'
python scripts/recovery_rehearsal.py
```

The rehearsal reads only hash-reviewed migrations through 0005, allocates fresh
synthetic native SQLite databases, compares original rows/schema, exercises
binary snapshots and pre/post SQL export/import, checks integrity/FKs and fourteen
constraint rejections, then removes all owned databases/exports. Its only report
is ignored `temporary/recovery-rehearsal-report.md`. It refuses existing database
paths, arbitrary CLI targets and redirected report paths. No developer database,
credential, remote service, real account or proof content is read.

Native SQLite success does not prove D1 migration or recovery safety. The
populated transaction probe exposes migration 0005's existing foreign-key
hazard and preserves rollback; published migration SQL is unchanged. Real D1
export/import, Time Travel, R2 recovery, Worker rollback, encrypted backup/access,
write-pause/data-loss acceptance and production promotion remain separate owner
gates in OPS. Canonical SPINE validation remains a local release gate because
the pinned engine repository is private; hosted CI runs application and
self-contained runner/recovery tests without copying private engine source.

## Local evidence and cleanup

The old `temporary/` reports/handoffs were removed after all 51 files were hash-verified in ignored `.local-evidence/flag-pre-audit-2026-10-26.zip` with its receipt. They are historical evidence, not current instructions. The offline recovery command may generate a fresh bounded report under `temporary/`; no runtime workflow reads that folder. LOG/INDEX/SDD are the authoritative context.
