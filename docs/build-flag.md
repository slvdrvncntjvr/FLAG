---
spine_type: BUILD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.35
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-30
reconciled: 2026-10-13
---

# Build Guide: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)
**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. How to build from these docs

[INDEX §6–7](index.md#6-current-development-baseline) owns the current deployed/local boundary, remaining gates and deferred requirements. Local disabled-intake source checks are recorded in [QAD §1](qad-flag.md#1-strategy). They do not authorize another implementation milestone or a release.

Read in this order before writing code:

1. `docs/index.md`
2. `IDEA` - scope, especially §4 Out of Scope and §4.1 invariants
3. `PRD` - the feature you are implementing, by ID
4. `SDD` - how it fits the system, especially §3 ERD and §5.1
5. The `RFC` for that feature, if one exists
6. This guide
7. `QAD` - before calling anything done

**Only build against `Locked` docs or an explicit owner implementation override for the named task.** IDEA is 2.0 Review after the wording-only cr-003; its scope, exclusions and invariants are unchanged. PRD 2.0 is Review under cr-002, and technical docs remain Review under the recorded overrides. LOG preserves the earlier bounded authorizations and implementation sequences. Apply the latest task boundary; a deferred requirement or completed foundation is not automatic authority to start the next feature.

Past authorizations and releases are recorded in [LOG decisions](log-flag.md#1-decisions), [QAD §1](qad-flag.md#1-strategy) and [OPS §7](ops-flag.md#7-production-readiness-gate). Policy, schema, source review, human acceptance and release are separate gates.

### To build X, read Y

| To implement... | Read | Verify against |
|---------------|------|----------------|
| A feature `PRD-F#` | PRD, then SDD, then RFC if one exists | QAD cases tagged with that ID |
| A schema change | SDD §3 ERD first (CR if Locked), then the migration | Migration applies to a fresh local D1; ERD and `web/src/server/db/schema.ts` agree |
| An API endpoint or server action | SDD §4 and §5.1 | QAD sad and abuse cases; invariant negative tests it touches |
| A UI surface | PRD acceptance criteria and §7 of this guide | QAD happy path; §7 checklist |

---

## 2. Pinned stack

Pins for `web/package.json`. Versions read from the npm registry on 2026-10-12. Manifest-verified on 2026-10-12 for: next, react, react-dom, @opennextjs/cloudflare, wrangler, drizzle-orm, drizzle-kit, better-auth, @better-auth/drizzle-adapter, zod, resend, vitest, @cloudflare/vitest-plugin, typescript, tailwindcss, @tailwindcss/postcss, eslint, eslint-config-next. The rest are planned and installed with the feature that needs them. Exact versions only, no ranges.

QR/phone ID-check helpers (`jsqr`, `cbor-x`) are DEFERRED future per RFC 001: pilot verification is manual live inspection, and no paid-SMS or QR-scan dependency is required for v1. They are not in `web/package.json` as installed deps. Brevo is preferred at runtime via fetch (no npm dep); Resend is the fallback provider via direct fetch too (`web/src/server/mail/index.ts:45`). The resend SDK remains installed but unused by the mail helper.

| Layer | Technology | Version | Verified | Source |
|-------|-----------|---------|----------|--------|
| Language | TypeScript | 5.9.3 | 2026-10-12 | https://www.npmjs.com/package/typescript |
| Type definitions | @types/node, @types/react, @types/react-dom | 20.19.43, 19.3.0, 19.3.0 | 2026-10-21 | https://www.npmjs.com/package/@types/node/v/20.19.43 , https://www.npmjs.com/package/@types/react/v/19.3.0 , https://www.npmjs.com/package/@types/react-dom/v/19.3.0 |
| Runtime (local/build) | Node.js | 24.22.1 | 2026-10-21 | https://github.com/nodejs/node/releases/tag/v24.22.1 |
| Runtime (deployed) | Cloudflare Workers, `nodejs_compat` | compatibility_date 2026-10-01 | 2026-10-12 | https://developers.cloudflare.com/workers/configuration/compatibility-dates/ |
| Framework | Next.js App Router | 16.4.3 | 2026-10-25 | https://github.com/vercel/next.js/releases/tag/v16.4.3 |
| UI runtime | React, React DOM | 19.2.8 | 2026-10-12 | https://react.dev/ |
| Adapter | @opennextjs/cloudflare (locked @opennextjs/aws) | 1.20.12 (4.1.11) | 2026-10-26 | https://registry.npmjs.org/@opennextjs/cloudflare/1.20.12 , https://registry.npmjs.org/@opennextjs/aws/4.1.11 |
| CLI | wrangler | 4.149.0 | 2026-10-12 | https://www.npmjs.com/package/wrangler |
| Database | Cloudflare D1 | managed | 2026-10-12 | https://developers.cloudflare.com/d1/ |
| ORM | drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | 2026-10-12 | https://orm.drizzle.team/docs/get-started/d1-new |
| Files | Cloudflare R2 | managed | 2026-10-12 | https://developers.cloudflare.com/r2/ |
| Auth | better-auth, @better-auth/drizzle-adapter | 1.7.7 | 2026-10-12 | https://www.better-auth.com/docs |
| Bot check | Cloudflare Turnstile | managed | 2026-10-12 | https://developers.cloudflare.com/turnstile/ |
| Email SDK (installed, unused by mail helper) | resend | 6.32.1 | 2026-10-12 | https://resend.com/docs |
| Styling | tailwindcss, @tailwindcss/postcss | 4.3.3 | 2026-10-12 | https://tailwindcss.com/docs |
| Components | shadcn CLI (Base UI base) | 4.21.4 | 2026-10-12 | https://ui.shadcn.com/docs/changelog |
| Primitives | @base-ui/react | 1.9.0 | 2026-10-12 | https://base-ui.com/ |
| Forms | react-hook-form, @hookform/resolvers, zod | 7.90.0, 5.9.1, 4.6.6 | 2026-10-12 | https://react-hook-form.com/ , https://zod.dev/ |
| Tables | @tanstack/react-table | 9.2.8 | 2026-10-12 | https://tanstack.com/table/latest |
| URL state | nuqs | 2.10.2 | 2026-10-12 | https://nuqs.dev/ |
| Uploads | react-dropzone | 20.1.3 | 2026-10-12 | https://react-dropzone.js.org/ |
| Toasts | sonner | 2.0.8 | 2026-10-12 | https://sonner.emilkowal.ski/ |
| Icons | lucide-react | 1.55.0 | 2026-10-12 | https://lucide.dev/ |
| QR decode (browser) | jsqr | 1.4.0 | 2026-10-12 | https://www.npmjs.com/package/jsqr |
| CBOR (ID check) | cbor-x | 1.6.6 | 2026-10-12 | https://www.npmjs.com/package/cbor-x |
| Unit and integration tests | vitest, @cloudflare/vitest-plugin | 4.1.12, 1.4.2 | 2026-10-25 | https://registry.npmjs.org/vitest/4.1.12 , https://www.npmjs.com/package/@cloudflare/vitest-plugin/v/1.4.2 |
| End-to-end tests (local auth/onboarding harness) | @playwright/test | 1.64.1 | 2026-10-21 | https://www.npmjs.com/package/@playwright/test/v/1.64.1 |
| Lint | eslint, eslint-config-next | 9.39.5, 16.4.3 | 2026-10-25 | https://registry.npmjs.org/eslint-config-next/16.4.3 , https://nextjs.org/docs/app/api-reference/config/eslint |
| Fonts | Source Serif 4, Inter, IBM Plex Mono via next/font/local | @fontsource-variable/source-serif-4 5.3.1, @fontsource-variable/inter 5.3.0, @fontsource/ibm-plex-mono 5.3.0 | 2026-10-14 | https://www.npmjs.com/package/@fontsource-variable/source-serif-4/v/5.3.1 , https://www.npmjs.com/package/@fontsource-variable/inter/v/5.3.0 , https://www.npmjs.com/package/@fontsource/ibm-plex-mono/v/5.3.0 |

Version notes:
- OpenNext Cloudflare 1.20.12 with its exact AWS 4.1.11 dependency (registry read 2026-10-26). Its peer range admits Next >=16.4.1, so pinned Next 16.4.3 needs no unsupported-version bypass.
- Next and eslint-config-next move together; both are 16.4.3. Vitest is 4.1.12. These were security updates (2026-10-25), so they skipped the seven-day wait. Sources: https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r , https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp .
- Security overrides, scoped by version or parent: Undici 6.29.1 and 7.30.1, body-parser 2.4.0 under Express, and Zod 4.6.6 under the test plugin. Direct application Zod is unchanged. Do not accept audit-suggested incompatible downgrades. Sources: https://registry.npmjs.org/undici/6.29.1 , https://registry.npmjs.org/undici/7.30.1 , https://registry.npmjs.org/body-parser/2.4.0 , https://registry.npmjs.org/zod/4.6.6 .
- Node 24 (owner-approved 2026-10-21): `.nvmrc` at the repo root and `web/.nvmrc` pin 24.22.1. `web/package.json` requires >=24.22.1 <25 and `web/.npmrc` enables engine-strict. The exact pin fixes the local/build version; the range admits later Node 24 security patches.
- Cloudflare Workers Builds reads `.nvmrc` from its build root (`web/`). A dashboard NODE_VERSION override must be absent or match 24.22.1. NODE_VERSION in Wrangler runtime vars does not select the build tool. The deployed app runs in workerd with nodejs_compat, controlled by compatibility_date 2026-10-01 and the existing flags. Sources: https://developers.cloudflare.com/workers/ci-cd/builds/build-image/ and https://developers.cloudflare.com/workers/runtime-apis/nodejs/ .
- The three @types packages are exact pins matching the lockfile.
- Fonts are pinned npm assets loaded locally with the same faces and Latin subsets. The build makes no Google Fonts network fetch. OFL licenses are in web/public/font-licenses/.
- Declared peer compatibility is checked separately from an actual Worker build.
- better-auth below 1.7.7 has a critical magic-link account takeover (GHSA-965c-763c-88jm). Never downgrade.
- `@cloudflare/vitest-pool-workers` is deprecated and renamed `@cloudflare/vitest-plugin`. The plugin is 1.4.2 for security fixes (npm verified 2026-10-14; peer vitest ^4.1.0 or ^5.0.0).
- cr-001 transitive tool overrides: glob 10.5.0 under @node-minify/core and esbuild 0.25.12 under @esbuild-kit/core-utils (verified 2026-10-14). Sources: https://www.npmjs.com/package/glob/v/10.5.0 and https://www.npmjs.com/package/esbuild/v/0.25.12 . A braces advisory through ESLint had no compatible patched release on 2026-10-14. Do not run `npm audit fix --force` to downgrade the Next 16 lint configuration.
- TypeScript stays on 5.x and ESLint on 9.x until Next's tooling confirms the new majors.
- Wait 7 days after a release before bumping a pin, unless the release fixes a security advisory.

### Known deprecations

APIs in this stack that look correct but are not, with the current replacement.

| Deprecated | Use instead | Since | Notes |
|-----------|-------------|-------|-------|
| `output: "export"` in next.config | OpenNext Cloudflare build | this rewrite | The static export cannot run auth, uploads, or moderation |
| `framer-motion` import | `motion/react` | motion 11+ | Registry components sometimes pull `framer-motion`; rewrite the import and dedupe |
| `asChild` prop on shadcn components | `render` prop | Base UI default, shadcn Jul 2026 | Radix-era snippets online still use `asChild` |
| `useReactTable`, `getCoreRowModel` | `useTable` with `tableFeatures` | TanStack Table v9 | Most blog examples are v8 |
| `hsl(var(--chart-1))` | `var(--chart-1)` | shadcn charts on Recharts v3 | Only if a chart is ever added |
| `middleware.ts` | `proxy.ts` | Next 16 | Neither is used for auth here; see SDD §7 |
| `revalidateTag(tag)` | `revalidateTag(tag, profile)` or `updateTag(tag)` | Next 16 | Use `updateTag` after a moderator decision |
| `cacheComponents: true` | leave off | OpenNext 1.20.x | Open production crash in the adapter |
| vaul (drawer) | shadcn Drawer or Sheet on Base UI | vaul unmaintained | |

---

## 3. Commands

Commands below are copied from web/package.json.

The baseline CI workflow (`.github/workflows/baseline.yml`) runs on pull requests to dev and main and on branch pushes. It uses pinned Node and runs typechecks, lint, integration tests, deploy-guard tests, packaged Worker smoke tests, browser tests and dependency audits. The workflow file is the source of truth for what CI runs. Canonical SPINE is private, so run the docs and checkpoint checks locally before any release. Local setup helpers keep existing credentials and reject malformed, duplicate or multiline settings. README documents how to select the approved Cloudflare account.

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Dev | `npm run dev` (`next dev`, with local D1 and R2 through `initOpenNextCloudflareForDev`) |
| Build | `npm run build` (`next build`) |
| Preview on Workers runtime | `npm run preview` (`opennextjs-cloudflare build && opennextjs-cloudflare preview`) |
| Build Worker (production) | `npm run build:worker` (`opennextjs-cloudflare build`) |
| Build Worker (dev) | `npm run build:worker:dev` (`opennextjs-cloudflare build --env dev`) |
| Deploy already-built Worker (production) | `npm run deploy:worker` (configuration guard then `opennextjs-cloudflare deploy`) |
| Deploy already-built Worker (dev) | `npm run deploy:worker:dev` (configuration guard then `opennextjs-cloudflare deploy --env dev`) |
| Manual build and deploy | `npm run deploy` (production), `npm run deploy:dev` (dev) |
| Test | `npm test` (`vitest run`) |
| Deploy guard tests | `npm run test:deploy` (branch, environment, account and binding checks) |
| Packaged Worker smoke | `npm run test:worker:smoke` after `npm run build:worker:dev`; executes the built artifact in local workerd with synthetic isolated D1/R2 |
| End-to-end | `npm run test:e2e` (`node scripts/e2e.mjs`); desktop and 360px Chromium |
| Lint | `npm run lint` (`eslint`) |
| Typecheck | `npm run typecheck` (`tsc --noEmit && tsc --noEmit -p tests/tsconfig.json && tsc --noEmit -p e2e/tsconfig.json`) |
| Generate migration | `npm run db:generate` (`drizzle-kit generate`). Do not run until the Drizzle journal is brought up to date; see §3.1 |
| Apply migrations locally | `npm run db:migrate:local` (`wrangler d1 migrations apply flag-db --local`) |
| Apply migrations remote | `npm run db:migrate:remote` (production), `npm run db:migrate:dev` (dev); no environment named preview exists |
| Cloudflare binding types | `npm run cf-typegen` (`wrangler types --env-interface CloudflareEnv --strict-vars false`) |
| Read pinned engine | `python scripts/spine.py engine` (repo root) |
| Read pinned template | `python scripts/spine.py template CODE` (repo root) |
| Docs validator | `python scripts/spine.py check docs/` (repo root) |
| Checkpoint verification | `python scripts/spine.py checkpoint verify` (repo root) |
| Python runner tests | `python -m unittest discover -s scripts -p 'test_*.py'` (repo root) |

Local browser tests use fresh OS-temporary app/D1/R2 state, synthetic credentials and no provider keys. The runner refuses an occupied port 3000, captures the localhost OTP privately, and cleans up its own server, processes and dependency link when it finishes. Passing it does not prove real mail, OAuth, physical-device or deployed-runtime behavior. The packaged smoke test separately runs the built artifact in local workerd.

### 3.1 Deploy and migrations (read before any schema change)

Cloudflare Workers Builds is intended to deploy `flag` from `main` and `flag-dev` from `dev`, with root directory `web` for both. Configure separate build and deploy commands: production uses `npm run build:worker` then `npm run deploy:worker`; dev uses `npm run build:worker:dev` then `npm run deploy:worker:dev`. Each service's production branch must match its intended branch. Non-production branch builds are optional and need explicit preview/upload commands and environments; do not use the full deploy scripts as the build command. Set watch paths to application changes if documentation-only builds are unwanted.

A green build alone does not prove isolation. A misconfigured build command can deploy the dev Worker with production DB and auth values. Only checks for deliberately configured branches should run; inspect the command behind any unexpected check before dismissing it.

Reference, checked 2026-10-14: https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments and https://opennext.js.org/cloudflare/howtos/dev-deploy . Dashboard settings are external configuration and must be checked separately from the repository scripts.

Push protection: web/open-next.config.ts:2 loads the CI check before adapter operations and passes the selected environment to child commands. Plain Wrangler can bypass adapter config, so web/wrangler.jsonc:12 also runs web/scripts/check-wrangler-build.mjs before Wrangler uploads. web/scripts/check-ci-target.mjs rejects a CI Worker-name/environment mismatch, `flag` operations outside main, and `flag-dev` operations outside dev. Incorrect dashboard commands deliberately fail. Cloudflare exposes WORKERS_CI_BRANCH per https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables .

Environment selection: `check-ci-target.mjs` resolves an explicit `--env`/`-e` before CLOUDFLARE_ENV and rejects a missing flag value. `web/scripts/check-deploy.mjs` uses the same resolver and keeps the npm scripts' positional dev argument. Wrangler does not forward its CLI arguments to a custom-build child, so the default build command in `web/wrangler.jsonc` passes `--env=` and the dev override passes `--env=dev`. Before deploy, `check-deploy.mjs` and `web/scripts/check-resource-bindings.mjs` check the selected account, Worker, D1 database (name and ID) and PROOFS bucket, and reject missing, duplicate, wrongly typed or mismatched bindings. References: [Wrangler custom builds](https://developers.cloudflare.com/workers/wrangler/custom-builds/) and [environment selection](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).

After a deploy, confirm CI is green, then do a manual smoke check of the deployed site.

**Database migrations are NOT automatic, and this is deliberate.** Auto-deploy ships code only. D1 migrations are forward-only with no automatic rollback, so they are applied by hand, dev before production. The trigger is mechanical: any change that adds or edits a file under `web/drizzle/` (any structural change to `web/src/server/db/schema.ts`: new table, new/renamed/removed column, index, constraint, CHECK, type, or default change) needs a migration. Pure code, copy, styling, routing, or logic changes that use existing tables do NOT.

When schema changes, run these steps in order, from `web/`:

1. Review the ERD, then hand-write the migration as the next numbered SQL file in `web/drizzle/`. The Drizzle journal (`web/drizzle/meta/_journal.json`) ends at 0007, while 0008 and 0009 are hand-written. Do not run `npm run db:generate` until the journal is brought up to date. Keep `schema.ts` in sync by hand and cover the change with tests. Never edit a published migration.
2. Back up the target database with `wrangler d1 export` before any remote migration.
3. Apply backward-compatible migrations BEFORE the code that needs them goes live, dev first, then production:
   - dev DB: `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`)
   - production DB: `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`)
4. Push the code only after the matching database is ready; auto-deploy ships it. A destructive or renaming change needs an expand-and-contract rollout, not a blind migration ahead of running code.

Current migration and release state is in INDEX §6 and OPS §7. Published migrations stay unchanged. 0005 has a known foreign-key rebuild hazard on populated tables, so a passing empty local run is not permission to delete or rewrite production data. Check each target's migration ledger, schema, row counts and foreign keys before migrating. A failed later migration does not undo earlier successful ones.

## 4. Repo conventions

| Area | Convention |
|------|-----------|
| Branch policy | `main` is graded and deployed to production (`flag`). `dev` integrates and deploys to the dev Worker (`flag-dev`). Feature branches `f<n>-<short-name>` branch off `dev` and merge by pull request with independent agent review and green CI; dev needs no human approval under owner policy. Promoting to main needs green CI and the owner's explicit go-ahead |
| Branch protection | `main` has GitHub branch protection, configured in GitHub. That configuration is the source of truth; this guide does not mirror it |
| Commit format | Short imperative subject naming the feature ID when there is one: `PRD-F8 add policy acceptance gate` |
| Directory layout | `docs/` SPINE suite. `web/` the app: `src/app` routes only; `src/features/<module>` UI, actions, and queries per module; `src/components/ui` shadcn components; `src/components` shared FLAG components; `src/server/{auth,db,mail}`; `src/lib` pure helpers; `drizzle/` migrations; `tests/` unit and integration; `e2e/` Playwright |
| Module ownership | One developer owns each `src/features/<module>` folder and reviews every change to it. Assignments (owner 2026-10-13, LOG Q14): Dev A owns `verification`; Dev B owns `engagements` and `logs` (`src/features` log intake/proof); Dev C owns `moderation` and retention/maintenance. Shared `server/{auth,db,mail}` and `components` changes need the owning dev of the consuming module plus one reviewer |
| Naming | Files kebab-case; React components PascalCase; server actions verbNoun; DB tables snake_case singular |
| Error handling | Server actions return `{ ok: true, data }` or `{ ok: false, fieldErrors?, message }` and never throw to the client. Route handlers return JSON `{ error: code }` with the status codes in SDD §5. Another party's data is 404, not 403 |
| Data access | Pages and actions never call `db` directly; they call functions in `src/server/db/queries/*` that take the viewer as the first argument |
| Test location | `web/tests/**/*.test.ts` (Vitest in the Workers pool, local D1; config `web/vitest.config.mts`), `web/e2e/**/*.spec.ts` (Playwright). Negative tests named `nt-<nn>-*.test.ts` to match QAD |

---

## 5. Guardrails

Repo-specific prohibitions. These are enforced like engine §8 Hard Rules.

- Never commit secrets. Secrets live in Wrangler secrets per environment and in `web/.dev.vars` locally, which is gitignored. `group_context/` holds course files with member names; it stays out of git unless the team agrees otherwise.
- **INV-1:** only the moderator decision server action `decideReview` (`web/src/features/moderation/actions.ts:53`) may set a log to `published`. Its handling of log-kind cases is planned. No public reply path exists (PRD-F5 Retired). Reader queries select the current revision of `status = 'published'` non-expired logs unless the viewer is the filer, the named client, or a moderator.
- **INV-2:** `submitLog` checks the engagement is `accepted`, at least one attached PROOF_FILE exists, the anchor is valid, and the 15-calendar-day filing window holds, inside the same `db.batch()`; the D1 trigger is the backstop.
- **INV-3:** pilot verification is manual live inspection only. Never add a column, R2 prefix, log line, or analytics event that can hold an ID image, a full ID number, a QR payload, a phone proof, or any required ID-derived value. No ID hash is declared or stored in v1; future QR-derived hashing requires the deferred RFC and an ERD update before implementation. No paid-SMS step exists for v1. The verification handler is excluded from request logging.
- **INV-4:** proof bytes are served only by `/api/proofs/[id]` after the relationship check (moderator, filer, or named client; an admin only under a moderator permission or persona). No public bucket, no custom domain on the bucket, no presigned GET. `Cache-Control: private, no-store`; everyone else gets 404.
- **INV-5:** the ONLY permitted rating signals are the approved integer 1-5 per-log rating and the read-time client average derived from it (1-2 Negative, 3 Mixed, 4-5 Positive; tags explain nuance and never override the derived outcome). No score, rank, leaderboard, endorsement or trust badge, or any other score anywhere in schema, API, or UI. Sorting clients by outcome share is also forbidden.
- **INV-6:** no server action available to a client role writes ENGAGEMENT_LOG, LOG_REVISION, LOG_TAG, or PROOF_FILE. Decided revisions are frozen; changes land only through new moderated revisions via the private correction path (PRD-F13). No public-reply or corroboration write path exists (PRD-F5, PRD-F10 Retired).
- **INV-7:** every page outside `(public)` lives under the `(app)` or `(moderation)` route group, whose layouts require a session. Data access requires a viewer. noindex on everything but `/` plus `robots.txt` disallow and `X-Robots-Tag: noindex, nofollow`.
- **INV-8:** `createEngagement`, `saveLogDraft`, `submitLog`, and `submitFilerUpdate` call `requireVerifiedFreelancer()` as their first statement (verified status plus current policy acknowledgments). There is no `corroborate` path. No phone-OTP or QR-scan gate is required for v1.
- Copy rules: product copy is plain English that states facts. No exclamation marks, no "Welcome to...", no "This is for...", no "seamless", "empower", "unlock", or emoji. Write what the screen does in the fewest words.
- Never describe a client in product copy. The subject of a log sentence is the freelancer ("Reported by a verified freelancer").

---

## 6. Definition of done

- [ ] Implements a requirement by `PRD-F#` (Locked, or Draft with an owner authorization in `LOG`)
- [ ] Build passes: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Lint and typecheck clean: `npm run lint && npm run typecheck`
- [ ] QAD cases for the feature ID pass, including every negative test for the invariants it touches
- [ ] §7 UI checklist passes for any screen touched
- [ ] Docs updated if behavior changed; `INDEX` row bumped
- [ ] Policy source aligns with the approved scope; verify the current POLICY_VERSIONS values on the deployed legal pages before release

---

## 7. Interface system

Direction chosen by the owner on 2026-10-12: civic record. The reference points are public-record explorers (ProPublica Nonprofit Explorer), court dockets, and newspaper corrections. The app should read as a record kept carefully, not as a social feed or a marketing site.

**Type**
- Source Serif 4 for page titles and client names only (24 px and up).
- Inter for interface and body text, 16 px base on mobile.
- IBM Plex Mono with tabular figures for counts, references (FL-1042), dates, and amounts.
- Never more than three type sizes on one mobile screen.

**Color tokens** (OKLCH, defined once in `web/src/app/globals.css` as shadcn theme variables)
- `--paper`, `--ink`, `--rule`: neutral record surface and text.
- `--outcome-positive` blue (Okabe-Ito #0072B2), `--outcome-mixed` neutral gray with a hatch pattern, `--outcome-negative` vermillion (#D55E00). These are color-blind safe as a set.
- Outcome is never shown by color alone: every outcome carries a glyph and a word (check, tilde, exclamation; "Positive", "Mixed", "Negative").
- Text contrast at least 4.5:1, bar segments at least 3:1 against `--paper`.
- Radius 2 px or less. Rules (1 px borders) separate sections instead of cards and shadows.

**Components**
- shadcn on Base UI, added with the CLI, then restyled through tokens. Registries allowed: shadcn core and Dice UI (MIT). Anything else needs a review of its license and its `motion` major first.
- FLAG components: `RecordBar` (stacked counts with labels), `OutcomeMark`, `TagCount`, `LogEntry` (rating, filer name, date, correction/update history), `ProofChip`, `AverageBlock` (average with distinct contributor count plus Limited-record label under five), `CaseRow`, `StatusStamp` (dated "Reviewed Mar 02"). No `ReplyBlock`, same-experience control, upvote, or corroboration count exists.

**Motion**
- Only for feedback: 150-200 ms transitions on state change, toasts, sheet open. No scroll-linked animation, smooth-scroll library, parallax, or draggable decoration in the app.
- `MotionConfig reducedMotion="user"` at the root.

**Mobile and Messenger**
- Design at 360 px first. Primary action anchored at the bottom on forms.
- Use `dvh`/`svh`, never `100vh`.
- Keep the session in cookies, never localStorage.
- Messenger: the existing "Open in Chrome" helper in `web/src/features/logs/proof-upload.tsx` is an undecided PRD §6 candidate (LOG Q27). It stays as is until the owner decides, and it is not a release gate.
- JavaScript budget for task routes: under 150 KB compressed. Target LCP 2.5 s or less and INP 200 ms or less on a mid-range Android phone.

**Checklist for any screen**
- [ ] Works at 360 px wide with no horizontal scroll
- [ ] Every control reachable and operable by keyboard; visible focus
- [ ] Empty, loading, and error states exist and say what to do next
- [ ] No unapproved score, rank, leaderboard, endorsement badge, or ordering by outcome share; only the approved 1-5 rating and client average appear
- [ ] Copy follows §5 copy rules
- [ ] Outcome never conveyed by color alone

## 8. Scope references and technical boundaries

Use [INDEX §6–7](index.md#6-current-development-baseline) for implemented scope and remaining gates, [SDD §3](sdd-flag.md#3-data-model) for the schema/technical contracts, [QAD §1](qad-flag.md#1-strategy) for observed checks and [OPS §5/§7](ops-flag.md#5-runbooks) for operational/release procedures. This guide does not maintain a second milestone queue.

- Review the ERD before any new schema work. CORRECTION_REQUEST, DATA_REQUEST and lifecycle/closure fields remain design-first dependencies; their presence in the target design is not implementation evidence.
- With intake disabled, the app must still work on the 0008 schema. Behavior that needs 0009 fields needs 0009 applied first. The steps to enable intake on dev are in [OPS §5](ops-flag.md#5-runbooks).
- Local draft cleanup is not full retention or assessed account closure. Current cascades and append-only consent triggers must not be used to simulate those future workflows. Whether correction and lifecycle work must precede the first real publication is open (LOG Q28).
- D1 and R2 never become one cross-store atomic transaction. Preserve held and submitted evidence. A cleanup claim whose owner is unknown stays frozen rather than being taken over on a timer (SDD §3.7).

QR automation remains deferred; PRD-F11 notifications remain Should-Have and separate from email sign-in. Exclusions and all eight invariants remain governed by IDEA.
