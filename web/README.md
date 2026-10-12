# FLAG — web

Next.js (App Router) on OpenNext + Cloudflare Workers, D1 (Drizzle), Better Auth.
Runs entirely on free tiers: Cloudflare Workers Free plan + Brevo free email.

## Local development

```bash
cd web
npm install
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

## Checks

```bash
npm run test        # Vitest in the Workers pool (13 tests)
npm run typecheck   # tsc for app + tests
npm run lint        # eslint (ignores .open-next and .wrangler build output)
```

## Email (free, no domain required)

FLAG sends transactional email through **Brevo** (free tier: 300 emails/day, no
custom domain needed). `sendMail` picks a provider by which key is present:
`BREVO_API_KEY` → Brevo, else `RESEND_API_KEY` → Resend, else no-op (dev/tests).

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

In the Cloudflare dashboard → Workers & Pages → `flag` → Settings → Builds:

1. Connect the GitHub repo `slvdrvncntjvr/FLAG`, root directory `web`.
2. Production branch: `main`. Build command: `npm run deploy`.
3. Add a second build config for `dev` branch with build command `npm run deploy:dev`.
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

```bash
npm run db:migrate:remote   # production flag-db
npm run db:migrate:dev      # preview flag-db-dev
```

### Manual deploy (fallback, not the normal path)

```bash
npm run deploy       # production
npm run deploy:dev   # preview
```

After the first deploy of a new environment, confirm the printed binding line
shows the correct `BETTER_AUTH_URL` for that environment.

## Not yet enabled (optional, also free when configured)

- **Google sign-in** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google
  Cloud OAuth). Email-code sign-in works without it.
- **Turnstile bot check** — needs site/secret keys (requires a domain). Sign-in
  is rate-limited meanwhile (`cf-connecting-ip`, 3 code requests/min/address).
- **Freelancer verification (PRD-F1)** — Week 3–4 feature. Until it ships,
  `requireVerifiedFreelancer()` refuses everyone, so no logs can be filed. This
  is deliberate.
