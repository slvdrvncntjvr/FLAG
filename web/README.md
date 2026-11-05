# FLAG web

Next.js App Router on OpenNext/Cloudflare Workers, with D1/Drizzle, Better Auth
and private R2 proofs. Start at [the current project reference](../docs/index.md).
It owns current feature availability, last recorded deployments and remaining
work. [BUILD](../docs/build-flag.md) owns commands and conventions;
[QAD](../docs/qad-flag.md) owns checks; [OPS](../docs/ops-flag.md) owns releases.

## Local setup

Use Node **24.22.1** from .nvmrc. On PowerShell use npm.cmd/npx.cmd if the .ps1
shims are blocked. From the repository root:

```powershell
cd web
npm.cmd ci
node scripts/setup-local.mjs
node scripts/check-local.mjs
npm.cmd run db:migrate:local
npm.cmd run dev
```

Open http://localhost:3000. The setup script creates .dev.vars only when absent;
it preserves existing secrets. To repair an existing auth URL without rotating
credentials, use node scripts/setup-local.mjs --repair-url. Never commit local
secret files. If Wrangler needs account selection even for local D1, set
CLOUDFLARE_ACCOUNT_ID to the approved account_id in wrangler.jsonc in that shell.

Sign-in uses a six-digit email code. Console codes are available only on actual
HTTP localhost with neither mail key set. Existing BREVO_API_KEY or RESEND_API_KEY
causes real delivery; preserve developer credentials and avoid unintended mail.

New private log intake is off in both source environments. A local migration
does not enable it. See INDEX and OPS before changing that setting.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:deploy
node --test scripts/setup-local.test.mjs
npm.cmd run test:e2e
npm.cmd run build:worker:dev
npm.cmd run test:worker:smoke
```

Browser tests require installed Chromium (npx.cmd playwright install chromium).
The runner uses a disposable local app/D1/R2, synthetic accounts and credentials,
no developer secret files, and desktop plus 360px Chromium. It stops its owned
processes and cleans up once exit is proven. Packaged-worker smoke tests use
local workerd; neither test proves real mail, OAuth or human acceptance.

Run pinned documentation checks from the repository root:

```powershell
python scripts/spine.py check docs/
python scripts/spine.py checkpoint verify
```

SPINE stays at 0.3.0; the runner reads the pinned local tag without changing the
shared engine checkout. Read root AGENTS.md and the relevant installed Next docs
before coding. Historical logs and archives are excluded from routine reading.
