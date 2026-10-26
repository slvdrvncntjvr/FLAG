---
spine_type: BUILD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.21
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-26
reconciled: 2026-10-13
---

# Build Guide: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)
**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. How to build from these docs

Current owner-directed branch policy, 2026-10-26: dev now requires zero approving reviews and require_last_push_approval is false. This is the requested persistent change, not a temporary exception. Strict current-base verify/dependency-audit checks pinned to GitHub Actions app15368, administrator enforcement, stale-review dismissal and force-push/deletion prohibitions remain unchanged. Main retains one approving developer review and independent last-push approval; its complete protection configuration is unchanged. Agent code/scope review and required CI remain part of the development workflow.

Current scope: see INDEX section 6 for the observed dev release and LOG's 2026-10-26 owner authorization for the three audit repairs, current copy/docs, gated dev integration and local checkpoint. The repair includes additive migration 0007 for immutable case input snapshots and privacy/terms reacknowledgment at versions 2026-10-26. Product meaning, invariants, SPINE 0.3.0, published migration history and reconciled dates stay fixed. Review-state technical implementation is explicitly authorized within this scope; main/production remains gated by OPS section 7.

Read in this order before writing code:

1. `docs/index.md`
2. `IDEA` - scope, especially §4 Out of Scope and §4.1 invariants
3. `PRD` - the feature you are implementing, by ID
4. `SDD` - how it fits the system, especially §3 ERD and §5.1
5. The `RFC` for that feature, if one exists
6. This guide
7. `QAD` - before calling anything done

**Only build against `Locked` docs or an explicit owner implementation override.** IDEA remains Locked; PRD 2.0 is Review under owner-approved cr-002. cr-001 authorized the audit repairs while BUILD, SDD, QAD and OPS are Review; the latest 2026-10-25 LOG authorization additionally permits the recommended milestone sequence after each ERD/lifecycle gap is designed. Earlier narrower task approvals remain historical. Implement each dispatched scope against its named technical contract and QAD gates; do not infer full-product completion from a foundation delivery.

2026-10-15 task-specific owner override (LOG): issue #5 may implement the existing Review-state design for the PRD-F2/PRD-F3 database and R2 foundation. Later workflows remain separately scoped.

cr-001 aligns privacy/terms with the approved scope and bumps both versions to 2026-10-14, requiring reacceptance. The pages distinguish available accounts/onboarding from planned workflows. Dev deployed and verified on 2026-10-14; production remains on its previous release.

### To build X, read Y

| To implement... | Read | Verify against |
|---------------|------|----------------|
| A feature `PRD-F#` | PRD, then SDD, then RFC if one exists | QAD cases tagged with that ID |
| A schema change | SDD §3 ERD first (CR if Locked), then the migration | Migration applies to a fresh local D1; ERD and `web/src/server/db/schema.ts` agree |
| An API endpoint or server action | SDD §4 and §5.1 | QAD sad and abuse cases; invariant negative tests it touches |
| A UI surface | PRD acceptance criteria and §7 of this guide | QAD happy path; §7 checklist |

---

## 2. Pinned stack

Pins for `web/package.json`. Versions read from the npm registry on 2026-10-12. Manifest-verified on 2026-10-12 for: next, react, react-dom, @opennextjs/cloudflare, wrangler, drizzle-orm, drizzle-kit, better-auth, @better-auth/drizzle-adapter, zod, resend, vitest, @cloudflare/vitest-plugin, typescript, tailwindcss, @tailwindcss/postcss, eslint, eslint-config-next. The rest are planned and installed with the feature that needs them. Exact versions only, no ranges. No versions bumped in this alignment (2026-10-13).

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
- 2026-10-26 authorized baseline runtime repair: OpenNext Cloudflare 1.20.12 and its exact AWS 4.1.11 dependency replace 1.20.10/4.1.9 in the manifest/lock only. Both registry peer ranges are >=15.5.28 <16 or >=16.4.1, admitting pinned Next 16.4.3; no unsupported-version bypass is used. Registry metadata was read on this date. No product route, schema, policy, Worker compatibility setting or F1 design changes are included. Local gates are recorded separately in QAD.
- 2026-10-25 authorized security refresh: Next and its ESLint configuration move together to 16.4.3; Vitest moves to 4.1.12. OpenNext 1.20.10 and the Cloudflare test plugin 1.4.2 remain pinned; their declared peers admit the selected versions. The Next Server Actions denial-of-service advisory applies to the onboarding Server Action; separate cache/image RCE advisory conditions were not established as reachable on this Worker. Sources: https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r , https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp . This security repair qualifies for the seven-day pin-update exception. Clean installation and fresh full/omit-dev audits pass with zero findings; combined app/build/browser evidence is recorded in QAD after the logout repair settles.
- The same refresh uses version-scoped Undici overrides 6.29.1 and 7.30.1, Express-scoped body-parser 2.4.0 and test-plugin-scoped Zod 4.6.6. Existing major APIs and direct application Zod remain unchanged. These repair affected build/test dependency copies rather than accepting audit-suggested incompatible downgrades. Verified registry sources: https://registry.npmjs.org/undici/6.29.1 , https://registry.npmjs.org/undici/7.30.1 , https://registry.npmjs.org/body-parser/2.4.0 , https://registry.npmjs.org/zod/4.6.6 . The lock retains unrelated Vite/Rolldown/PostCSS versions; npm populated optional Tailwind WASI metadata during regeneration. A package in the production dependency graph is not by itself proof of an exposed deployed runtime path.
- 2026-10-21 owner-approved Node 24 migration: `.nvmrc` at the repository root and `web/.nvmrc` pin 24.22.1; `web/package.json` requires >=24.22.1 <25 and `web/.npmrc` enables engine-strict. The exact pin selects the reproducible local/build version; the engine range admits later Node 24 security patches. This is a security release, qualifying for the seven-day wait exception below. The official Windows archive was SHA-256 verified before execution. Clean installation under this exact version passes, together with all 85 Workers cases, 25 Node checks, three Python runner tests, app/test/E2E typechecks, lint, dev Worker build and deployment dry run. The copied strict-engine settings reject 24.8.0 in an isolated offline probe; the full-project offline probe first stopped on an uncached optional archive. All six desktop/360px Chromium cases also pass on Node 24.22.1; the complete runner exits zero and leaves no port-3000 listener, owned server process, or test temporary directory.
- Cloudflare Workers Builds supports `.nvmrc` in its configured build root (`web/`). A dashboard NODE_VERSION override must be absent or match 24.22.1; adding NODE_VERSION to Wrangler runtime vars does not select the build tool. The deployed app runs in workerd with nodejs_compat, separately controlled by compatibility_date 2026-10-01 and existing flags. This Node migration does not change that date or flags. Sources: https://developers.cloudflare.com/workers/ci-cd/builds/build-image/ and https://developers.cloudflare.com/workers/runtime-apis/nodejs/ .
- 2026-10-21 baseline cleanup replaces the three @types ranges with the exact versions already resolved in the lockfile; npm registry verification matches them. No installed/resolved package version changes.
- Fonts retain the same faces and Latin subsets but are pinned npm assets, loaded locally because Google Fonts requests failed during Worker build verification. No Google Fonts network fetch is needed at build time. OFL licenses are distributed under web/public/font-licenses/.
- Historical 2026-10-12 compatibility evidence used Next 16.3.8 while the adapter's 16.4 support work was open. The current security pin above supersedes that historical selection; declared peer compatibility is checked separately from the actual Worker build.
- better-auth below 1.7.7 has a critical magic-link account takeover (GHSA-965c-763c-88jm). Never downgrade.
- `@cloudflare/vitest-pool-workers` is deprecated and renamed `@cloudflare/vitest-plugin`. cr-001 updates the plugin to 1.4.2 for security fixes; npm verified 2026-10-14, peer vitest ^4.1.0 or ^5.0.0. That historical change used Vitest 4.1.11; the current manifest pins 4.1.12.
- cr-001 pins compatible transitive tool overrides: @node-minify/core's glob 10.5.0 and @esbuild-kit/core-utils' esbuild 0.25.12. Verified through installation/audit on 2026-10-14; sources https://www.npmjs.com/package/glob/v/10.5.0 and https://www.npmjs.com/package/esbuild/v/0.25.12 . The audit falls from 17 entries to five high entries from the same braces advisory through ESLint. braces 3.0.3 remains npm's latest on 2026-10-14; no compatible patched release exists. Do not run audit fix --force to downgrade the Next 16 lint configuration.
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

Commands below are copied from web/package.json. The isolated browser harness exercises accounts and manual verification on desktop/360px, including corrected-request history; QAD section 1 records actual candidate counts/results separately.

The credential-free baseline workflow retains verify/dependency-audit for PRs to dev/main and branch pushes. It uses pinned Node, app/test/E2E checks, integration/browser tests, Python runner/recovery fixtures, audits and packaged Worker gates. The repair extends anonymous live F1 probes and adds production-target no-upload coverage for main; exact workflow behavior lives in .github/workflows/baseline.yml. Canonical SPINE is private, so docs/checkpoint checks remain mandatory local release gates. Local setup helpers preserve existing credentials and reject malformed/duplicate/multiline settings; README documents the explicit approved account selection.

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
| Verify dev release | `npm run verify:dev -- --expected-version <full Worker UUID>` (explicit candidate, binding metadata, routes, invalid codes; no mail/signup); `npm run verify:dev -- --health-only` checks current health without candidate verification |
| Test | `npm test` (`vitest run`) |
| Deployment boundary, release identity and R2 audit tests | `npm run test:deploy` (branch/environment/account checks, active candidate identity, live binding validation and conservative R2 audit policy) |
| Packaged Worker smoke | `npm run test:worker:smoke` after `npm run build:worker:dev`; executes the built artifact in local workerd with synthetic isolated D1/R2 |
| Inspect R2 resources and usage | `npm run audit:r2` (read-only API inspection; exit 1 unsafe/incomplete resource inspection, exit 2 warnings/incomplete billing access; never a spending cap) |
| End-to-end | `npm run test:e2e` (`node scripts/e2e.mjs`); desktop and 360px Chromium |
| Lint | `npm run lint` (`eslint`) |
| Typecheck | `npm run typecheck` (`tsc --noEmit && tsc --noEmit -p tests/tsconfig.json && tsc --noEmit -p e2e/tsconfig.json`) |
| Generate migration | `npm run db:generate` (`drizzle-kit generate`) |
| Apply migrations locally | `npm run db:migrate:local` (`wrangler d1 migrations apply flag-db --local`) |
| Apply migrations remote | `npm run db:migrate:remote` (production), `npm run db:migrate:dev` (dev); no environment named preview exists |
| Cloudflare binding types | `npm run cf-typegen` (`wrangler types --env-interface CloudflareEnv --strict-vars false`) |
| Read pinned engine | `python scripts/spine.py engine` (repo root) |
| Read pinned template | `python scripts/spine.py template CODE` (repo root) |
| Docs validator | `python scripts/spine.py check docs/` (repo root) |
| Checkpoint verification | `python scripts/spine.py checkpoint verify` (repo root) |
| Python runner and recovery safety tests | `python -m unittest discover -s scripts -p 'test_*.py'` (repo root) |
| Offline recovery rehearsal | `python scripts/recovery_rehearsal.py` (repo root); hash-reviewed migrations through 0005, synthetic native SQLite only; report in ignored `temporary/recovery-rehearsal-report.md` |

Local browser infrastructure uses fresh OS-temporary app/D1/R2 state, synthetic credentials and no provider keys. It refuses an occupied port 3000, captures localhost OTP privately, and cleans up its owned server/process tree and dependency link after a finite run. No real mail, OAuth, physical-device or authenticated deployed-runtime acceptance follows from this suite. Packaged smoke separately exercises the built artifact in local workerd. LOG preserves the earlier cold-start, fixture, logout and runtime repair evidence.

### 3.1 Deploy and migrations (read before any schema change)

Cloudflare Workers Builds is intended to deploy `flag` from `main` and `flag-dev` from `dev`, with root directory `web` for both. Configure separate build and deploy commands: production uses `npm run build:worker` then `npm run deploy:worker`; dev uses `npm run build:worker:dev` then `npm run deploy:worker:dev`. Each service's production branch must match its intended branch. Non-production branch builds are optional and need explicit preview/upload commands and environments; do not use the full deploy scripts as the build command. Set watch paths to application changes if documentation-only builds are unwanted.

Evidence from the 2026-10-14 audit: supplied build log ran a deployment during the build and then a second deployment without --env dev, overriding only the Worker name. Historical flag-dev version a9393ce2 used production DB/auth values; active version 222b8b96 used the correct dev values. A green build alone does not prove isolation. After deployment verify the actual version's DB binding and BETTER_AUTH_URL. GitHub's original flag-dev failure had no inline error and its build API required unavailable Workers CI permissions. Only the checks for deliberately configured branches should run; do not dismiss unexpected checks without inspecting their commands.

Reference, checked 2026-10-14: https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments and https://opennext.js.org/cloudflare/howtos/dev-deploy . Dashboard settings remain external configuration and must be verified separately from the repository scripts.

Push protection: web/open-next.config.ts:2 loads the CI check before adapter operations and propagates the selected environment to child commands. Plain Wrangler can bypass adapter config, so web/wrangler.jsonc:12 also invokes web/scripts/check-wrangler-build.mjs:1 before Wrangler uploads. web/scripts/check-ci-target.mjs:16 rejects a CI Worker-name/environment mismatch and rejects flag operations outside main or flag-dev operations outside dev. This prevents the old commands from promoting a dev commit to production or overriding only the dev Worker name while selecting production bindings. Correct dashboard commands are still required; incorrect commands deliberately fail. Cloudflare exposes WORKERS_CI_BRANCH per https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables .

2026-10-21 local guard follow-up: `web/scripts/check-ci-target.mjs:5` resolves explicit `--env`/`-e` before CLOUDFLARE_ENV and rejects missing flag values; `web/scripts/check-deploy.mjs:6` uses the same resolver while preserving the npm scripts' positional dev argument. Wrangler does not forward its CLI arguments to a custom-build child, so `web/wrangler.jsonc:16` passes `--env=` in the default build command and the dev override passes `--env=dev`. These commands validate the environment Wrangler actually selected even when an inherited variable differs. Deployment target mapping and live DB/auth/PROOFS checks share `web/scripts/check-resource-bindings.mjs:4`; local configuration checks pin both the database name and ID, rejecting a production ID hidden behind a dev name. The audit and dev release verifier now reject missing, duplicate, incorrectly typed, or mismatched bindings; an older Worker with no PROOFS is a release-readiness error. References: [Wrangler custom builds](https://developers.cloudflare.com/workers/wrangler/custom-builds/) and [environment selection](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/). This is local audit repair under cr-001; no remote release is implied.

**Database migrations are NOT automatic, and this is deliberate.** Auto-deploy ships code only. D1 migrations are forward-only with no automatic rollback, so they are applied by hand, preview before production. The trigger is mechanical: any change that adds or edits a file under `web/drizzle/` — i.e. any structural change to `web/src/server/db/schema.ts` (new table, new/renamed/removed column, index, constraint, CHECK, type, or default change) — needs a migration. Pure code, copy, styling, routing, or logic changes that use existing tables do NOT.

When schema changes, run these three steps in order, from `web/`:

1. Generate the migration: `npm run db:generate` (writes the next `drizzle/000X_*.sql`).
2. Apply backward-compatible migrations to the database BEFORE the code that needs them goes live:
   - preview DB: `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`)
   - production DB: `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`)
3. Push the code only after the corresponding database is ready and the build commands above are verified; auto-deploy ships it. A destructive/renaming change needs an expand-and-contract rollout, not a blind migration ahead of running code.

Current migration/release state is INDEX section 6 and OPS section 7. Published 0000-0006 remain unchanged; repair migration 0007 adds the immutable submitted-profile snapshot and leaves original legacy inputs unknown. Dev migration readiness precedes the repair's auto-deploying merge; production must complete all its pending migrations and recovery gates before any main merge. 0005 has a documented populated foreign-key rebuild hazard, so a passing empty local fixture is not permission to delete or rewrite production data. Freshly inspect each target's ledger, schema, counts and FKs and capture the accepted recovery point first. Failed later migrations do not undo earlier successful migration files.

## 4. Repo conventions

| Area | Convention |
|------|-----------|
| Branch policy | `main` is graded and deployed to production. `dev` integrates and deploys to preview. Feature branches `f<n>-<short-name>` off `dev`, merged by pull request with one review from another developer. Production promotion waits for the owner's explicit signal |
| Enforced branch controls (API readback, 2026-10-26) | Dev: zero required approving reviews and no last-push approval, per explicit owner instruction. Main: one approving developer review and independent last-push approval. Both: strict current-base verify/dependency-audit pinned to Actions app15368, administrator enforcement, stale-review dismissal and no force pushes/deletion. Agent review and CI remain required working practice; main/production promotion still needs its separate owner signal |
| Commit format | Short imperative subject naming the feature ID when there is one: `PRD-F8 add policy acceptance gate` |
| Directory layout | `docs/` SPINE suite. `web/` the app: `src/app` routes only; `src/features/<module>` UI, actions, and queries per module; `src/components/ui` shadcn components; `src/components` shared FLAG components; `src/server/{auth,db,mail}`; `src/lib` pure helpers; `drizzle/` migrations; `tests/` unit and integration; `e2e/` Playwright. The retired `prototype/` static mock was deleted on 2026-10-14 |
| Module ownership | One developer owns each `src/features/<module>` folder and reviews every change to it. Assignments (owner 2026-10-13, LOG Q14): Dev A owns `verification`; Dev B owns `engagements` and `logs` (`src/features` log intake/proof); Dev C owns `moderation` and retention/maintenance. Shared `server/{auth,db,mail}` and `components` changes need the owning dev of the consuming module plus one reviewer |
| Naming | Files kebab-case; React components PascalCase; server actions verbNoun; DB tables snake_case singular |
| Error handling | Server actions return `{ ok: true, data }` or `{ ok: false, fieldErrors?, message }` and never throw to the client. Route handlers return JSON `{ error: code }` with the status codes in SDD §5. Another party's data is 404, not 403 |
| Data access | Pages and actions never call `db` directly; they call functions in `src/server/db/queries/*` that take the viewer as the first argument |
| Test location | `web/tests/**/*.test.ts` (Vitest in the Workers pool, local D1; config `web/vitest.config.mts`), `web/e2e/**/*.spec.ts` (Playwright). Negative tests named `nt-<nn>-*.test.ts` to match QAD |

---

## 5. Guardrails

Repo-specific prohibitions. These are enforced like engine §8 Hard Rules.

- Never commit secrets. Secrets live in Wrangler secrets per environment and in `web/.dev.vars` locally, which is gitignored. `group_context/` holds course files with member names; it stays out of git unless the team agrees otherwise.
- **INV-1:** only `decideCase` sets a log to `published` (no public reply path exists; PRD-F5 Retired). Reader queries select the current revision of `status = 'published'` non-expired logs unless the viewer is the filer, the named client, or a moderator.
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
- Detect the Facebook and Messenger in-app browser and, before the proof upload step, offer "Open in Chrome".
- JavaScript budget for task routes: under 150 KB compressed. Target LCP 2.5 s or less and INP 200 ms or less on a mid-range Android phone.

**Checklist for any screen**
- [ ] Works at 360 px wide with no horizontal scroll
- [ ] Every control reachable and operable by keyboard; visible focus
- [ ] Empty, loading, and error states exist and say what to do next
- [ ] No unapproved score, rank, leaderboard, endorsement badge, or ordering by outcome share; only the approved 1-5 rating and client average appear
- [ ] Copy follows §5 copy rules
- [ ] Outcome never conveyed by color alone

## 8. Baseline boundary and next development milestones

Current integration boundary: auth/onboarding and manual verification are deployed to dev through 0006; INDEX section 6 and QAD section 1 distinguish that observed release from the repair candidate. Complete code/tests, independent review, migration preflight and exact-version dev verification before the authorized development checkpoint. No full-product or main/production acceptance follows from these gates.

The sequence below organizes existing owner-approved requirements under the recorded implementation override; it introduces no new requirements. Read SDD §3 before every migration. Each implementation milestone needs its named scope and the relevant QAD happy, sad, abuse and invariant tests.

| Milestone | Existing scope | Required dependency / release gate |
|-----------|----------------|------------------------------------|
| Current baseline | PRD-F7, PRD-F8: patched dependencies, reliable sign-in/sign-out, acknowledgment, reproducible local setup and CI | Clean install, audits, actual app/test/E2E typechecks, lint, Workers/Node/Python tests, browser cases, dev Worker build/dry run, independent review and verified dev release; real mail and physical-device evidence remain distinct |
| Verification and shared review foundation | PRD-F1 and verification part of PRD-F4 | Implement SDD §3.5 and its ERD first: nullable inspection tuple, one undecided request, shared claim/decision/audit rows, owner name/profile/portfolio capture; role/conflict/reason/atomic rollback gates H-24/H-25, S-32–S-35/S-38, AB-26–AB-28/AB-31 and NT-05/NT-10 before replacing the fail-closed guard |
| Consented engagement handshake | PRD-F9 | Verified/current-policy freelancer gate; atomic single-use invite consumption, client account/profile association and engagement-specific consent receipt; decline creates no reputation signal |
| Private log and proof intake | PRD-F2, PRD-F3 and per-log PRD-F14 | Accepted relationship, correct parties, approved filing clock, proof authorization/validation, submission/freeze constraints, quotas and draft/upload cleanup before accepting real material; intake never publishes |
| Correction and lifecycle prerequisites | PRD-F13, PRD-F12 | Build private correction/filer-update review, assessed closure, visibility expiry, finite holds and idempotent purge alongside intake/publication development; required correction and retention behavior must exist before the first real publication |
| Publication, records and averages | Remaining PRD-F4, PRD-F6, aggregate PRD-F14 | Human approval and immutable review history; signed-in relationship-scoped reads; approved eligibility/average rules; correction and lifecycle prerequisites above; no publication without those boundaries |

Resolved design contracts and remaining implementation dependencies:

- Local migration 0006 and `web/src/server/db/schema.ts:154` implement SDD §3.5's nullable request evidence; a completed inspection tuple and current moderator lease gate the eventual decision. Focused backend/privacy/migration tests exist; complete integrated and browser/review gates before release. No separate name approval or automated ID scanning.
- `POLICY_ACCEPTANCE` stores user/policy/version/time, while `ENGAGEMENT` currently stores acceptance time without a receipt relationship. Design explicit per-engagement consent linkage and transactional acceptance before building the handshake; onboarding is not consent to every engagement.
- MODERATION_CASE and AUDIT_EVENT now exist locally in 0006, with only verification handlers active. CORRECTION_REQUEST and DATA_REQUEST remain later dependencies; their presence in the ERD is not implemented evidence. Preserve IDs and approved product meaning.
- Plan the existing design-first closure/retirement fields and preservation migration before account closure or retention work. Current account/profile cascades and append-only consent triggers are not an implemented retention system; do not delete accounts to simulate assessed closure.
- Add the SDD submission/proof/freeze/maintenance constraints with their workflows. D1/R2 foundation tests do not prove upload authorization, publication safety or cross-store atomicity.

QR automation remains deferred; paid SMS, public replies, corroboration, refusal signals, ranks and marketplace/payment work are not introduced by this plan. PRD-F11 notifications remain Should-Have, separate from email authentication.
