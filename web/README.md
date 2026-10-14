# FLAG — web

Next.js (App Router) on OpenNext + Cloudflare Workers, D1 (Drizzle), Better Auth.
Runs entirely on free tiers: Cloudflare Workers Free plan + Brevo free email.

## Local development

```bash
cd web
npm ci
npm run db:migrate:local   # apply drizzle migrations to the local D1
npm run dev                # http://localhost:3000
```

Sign-in uses a 6-digit email code. With no email key set, the code is printed to
the dev-server console (look for `[dev] sign-in code for ...`). `.dev.vars` holds
local secrets; `BETTER_AUTH_SECRET` is required, email keys are optional.

To exercise the real Workers runtime instead of the Next dev server:

```bash
npm run preview            # opennextjs-cloudflare build && preview
```

Inter, Source Serif 4, and IBM Plex Mono come from pinned Fontsource packages
through next/font/local. Builds need no Google Fonts request. Font licenses
are included in public/font-licenses/.

## Checks

```bash
npm run test        # Vitest in the Workers pool (21 tests)
npm run test:deploy # CI branch/environment boundaries (6 Node tests)
npm run typecheck   # tsc for app + tests
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

Both run on the Cloudflare Workers Free plan. The preview environment has its own
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
4. Set runtime variables/secrets **in the dashboard**, per environment:
   `BETTER_AUTH_SECRET`, `BREVO_API_KEY`. (`BETTER_AUTH_URL` and `MAIL_FROM`
   come from `wrangler.jsonc`.)

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

Apply migrations before code that needs them. The audit repair adds
`drizzle/0003_melted_the_twelve.sql` for durable authentication limits; apply
it to dev before releasing there, then production before production release.
The CI deployment commands do not migrate databases automatically.

```bash
npm run db:migrate:remote   # production flag-db
npm run db:migrate:dev      # preview flag-db-dev
```

### Manual deploy (fallback, not the normal path)

```bash
npm run deploy       # production
npm run deploy:dev   # preview
```

After every deployment, verify the deployed version's actual `DB` binding and
`BETTER_AUTH_URL`, not only the build result or Worker name. Dev must use
`flag-db-dev` and `https://flag-dev.factsfirst.workers.dev`; production uses
`flag-db` and `https://flag.factsfirst.workers.dev`. The deploy scripts reject a
CI Worker-name override that disagrees with the selected environment.

The OpenNext configuration also rejects CI operations for `flag` outside
`main`, for `flag-dev` outside `dev`, and when the CI Worker name disagrees with
the selected environment. This covers direct adapter commands as well as the
scripts. Incorrect dashboard commands produce a failed check until corrected.
Wrangler's custom build also checks the target before upload, covering a
plain default `wrangler deploy` that bypasses the adapter configuration.

`npm run verify:dev` checks the active dev version's bindings, anonymous routes,
legal-page versions, indexing headers, and the live OTP limit using invalid
codes. It sends no sign-in mail and creates no account. It needs the existing
Wrangler login for read-only deployment metadata.

The privacy and terms versions are now `2026-10-14`; existing accounts must
accept again after release. Legal pages label the future workflows explicitly.
Accounts/onboarding are the currently implemented product boundary.

## Not yet enabled (optional, also free when configured)

- **Google sign-in** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google
  Cloud OAuth). Email-code sign-in works without it.
- **Turnstile bot check** — needs site/secret keys (requires a domain). Sign-in
  uses durable D1 rate limits meanwhile (`cf-connecting-ip` plus email).
- **Freelancer verification (PRD-F1)** — Week 3–4 feature. Until it ships,
  `requireVerifiedFreelancer()` refuses everyone, so no logs can be filed. This
  is deliberate.

## Remaining dependency advisory

The 2026-10-14 compatible security updates reduce npm audit from 17 affected
dependency entries to five high entries, all from the braces advisory through
ESLint. There is no compatible patched braces release available; npm's forced
fix downgrades Next's lint configuration. Keep the current compatible tooling
and recheck when a patch is published. The affected path is build/lint tooling.
