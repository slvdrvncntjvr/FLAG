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
the repo's disposable `temporary/` folder.

[INDEX §6–7](../docs/index.md#6-current-development-baseline) is the current status and remaining-work map. Private log intake is off unless `PRIVATE_INTAKE_ENABLED` is exactly `"true"` (`src/features/logs/rollout.ts`); `wrangler.jsonc` sets it to `"false"` for dev and production.

## Local development

Use Node **24.22.1**, pinned in the repository and `web/` `.nvmrc` files. With
nvm (including nvm-windows), run `nvm install 24.22.1` and `nvm use 24.22.1`
before installing dependencies. `web/.npmrc` enforces the Node 24 requirement in
`package.json`; it rejects older runtimes during installation. Verify with
`node --version` (must print `v24.22.1`) in a fresh terminal.

Set the approved Cloudflare account explicitly in each development shell
(PowerShell: `$env:CLOUDFLARE_ACCOUNT_ID = '1af65da586efd62d6f6d429240395f28'`; Bash:
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
and deletes temporary data after the finite suite only after owned-process exit is proven. Unproven termination retains the owned state for diagnosis.

The suite runs on desktop and 360px Chromium. Scenarios cover accounts/onboarding, manual verification/reject/resubmit/history, consent-first engagements and synthetic private draft/upload/pending intake, including actual OTP limits with scenario-local synthetic networks (`e2e/accounts.spec.ts`, `e2e/verification.spec.ts`, `e2e/engagements.spec.ts`, `e2e/log-intake.spec.ts`). The runner uses Next development mode and isolated local D1/R2; it does not prove real mail, Google OAuth, deployed behavior or physical devices.

OTPs stay in a restricted temporary file and are removed at teardown. Playwright disables traces and automatic screenshots (`playwright.config.ts`), but the log-intake scenario captures one synthetic pending-page screenshot. Failure reports and test output are ignored by Git and may contain synthetic account details; do not publish them.

To exercise the real Workers runtime instead of the Next dev server:

```bash
npm run preview            # opennextjs-cloudflare build && preview
```

Inter, Source Serif 4, and IBM Plex Mono come from pinned Fontsource packages
through next/font/local. Builds need no Google Fonts request. Font licenses
are included in public/font-licenses/.

## Checks

```bash
npm run test        # Vitest in the Workers pool
npm run test:deploy # Deploy guard, invite-return and browser-harness tests
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

Apply migrations before the code that needs them, dev first, then production. Take a `wrangler d1 export` backup of the target first. Migrations are forward-only; never edit a published one. Migration 0005 rebuilds `engagement_log` and can fail on populated tables, so check row counts before applying it anywhere new. Deploy commands do not migrate databases. Current schema state per environment is in [INDEX §6](../docs/index.md#6-current-development-baseline).

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

After every deploy, check that CI is green and run the manual smoke check (sign in, accept current policies, open /home; signed-out /home and /onboarding redirect to /sign-in).

Dev and source privacy and terms versions are `2026-10-27`; existing accounts must reaccept them. Freelancer acknowledgment and per-engagement client consent remain `2026-10-12` (`src/lib/policies.ts`).

## Not yet enabled (optional, also free when configured)

- **Google sign-in** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google
  Cloud OAuth). Email-code sign-in works without it.
- **Turnstile bot check** — needs site/secret keys (requires a domain). Sign-in
  uses durable D1 rate limits meanwhile (`cf-connecting-ip` plus email).

Moderator and admin roles have no admin screen yet. Set `user.role` directly in D1.

## Local evidence

`.local-evidence/` at the repo root is ignored by Git. It holds past run receipts and is never needed to build, test or deploy.
