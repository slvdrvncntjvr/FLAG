---
spine_type: BUILD
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 2.5
status: Review
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-21
reconciled: 2026-10-13
---

# Build Guide: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)
**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. How to build from these docs

Read in this order before writing code:

1. `docs/index.md`
2. `IDEA` - scope, especially §4 Out of Scope and §4.1 invariants
3. `PRD` - the feature you are implementing, by ID
4. `SDD` - how it fits the system, especially §3 ERD and §5.1
5. The `RFC` for that feature, if one exists
6. This guide
7. `QAD` - before calling anything done

**Only build against `Locked` docs or a specific owner-approved change record.** The launch suite locked on 2026-10-13. cr-001 authorizes the audit repairs while BUILD, SDD, QAD, and OPS are Review; IDEA and PRD remain Locked. This approval does not authorize implementing the entire future feature backlog.

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

QR/phone ID-check helpers (`jsqr`, `cbor-x`) are DEFERRED future per RFC 001: pilot verification is manual live inspection, and no paid-SMS or QR-scan dependency is required for v1. They are not in `web/package.json` as installed deps. Brevo is preferred at runtime via fetch (no npm dep); `resend` stays as the fallback.

| Layer | Technology | Version | Verified | Source |
|-------|-----------|---------|----------|--------|
| Language | TypeScript | 5.9.3 | 2026-10-12 | https://www.npmjs.com/package/typescript |
| Runtime (local) | Node.js | 22.21.1 | 2026-10-12 | https://nodejs.org/en/docs |
| Runtime (deployed) | Cloudflare Workers, `nodejs_compat` | compatibility_date 2026-10-01 | 2026-10-12 | https://developers.cloudflare.com/workers/configuration/compatibility-dates/ |
| Framework | Next.js App Router | 16.3.8 | 2026-10-12 | https://github.com/vercel/next.js/releases/tag/v16.3.8 |
| UI runtime | React, React DOM | 19.2.8 | 2026-10-12 | https://react.dev/ |
| Adapter | @opennextjs/cloudflare | 1.20.10 | 2026-10-12 | https://github.com/opennextjs/opennextjs-cloudflare/releases |
| CLI | wrangler | 4.149.0 | 2026-10-12 | https://www.npmjs.com/package/wrangler |
| Database | Cloudflare D1 | managed | 2026-10-12 | https://developers.cloudflare.com/d1/ |
| ORM | drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | 2026-10-12 | https://orm.drizzle.team/docs/get-started/d1-new |
| Files | Cloudflare R2 | managed | 2026-10-12 | https://developers.cloudflare.com/r2/ |
| Auth | better-auth, @better-auth/drizzle-adapter | 1.7.7 | 2026-10-12 | https://www.better-auth.com/docs |
| Bot check | Cloudflare Turnstile | managed | 2026-10-12 | https://developers.cloudflare.com/turnstile/ |
| Email | resend | 6.32.1 | 2026-10-12 | https://resend.com/docs |
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
| Unit and integration tests | vitest, @cloudflare/vitest-plugin | 4.1.11, 1.4.2 | 2026-10-14 | https://www.npmjs.com/package/@cloudflare/vitest-plugin/v/1.4.2 |
| End-to-end tests | @playwright/test | 1.64.0 | 2026-10-12 | https://playwright.dev/ |
| Lint | eslint, eslint-config-next | 9.39.5, 16.3.8 | 2026-10-12 | https://nextjs.org/docs/app/api-reference/config/eslint |
| Fonts | Source Serif 4, Inter, IBM Plex Mono via next/font/local | @fontsource-variable/source-serif-4 5.3.1, @fontsource-variable/inter 5.3.0, @fontsource/ibm-plex-mono 5.3.0 | 2026-10-14 | https://www.npmjs.com/package/@fontsource-variable/source-serif-4/v/5.3.1 , https://www.npmjs.com/package/@fontsource-variable/inter/v/5.3.0 , https://www.npmjs.com/package/@fontsource/ibm-plex-mono/v/5.3.0 |

Version notes:
- Fonts retain the same faces and Latin subsets but are pinned npm assets, loaded locally because Google Fonts requests failed during Worker build verification. No Google Fonts network fetch is needed at build time. OFL licenses are distributed under web/public/font-licenses/.
- Next 16.4.0 is out, but OpenNext's support PR for it was still open on 2026-10-12. 16.3.8 is the lowest 16.x the adapter accepts and includes the image-optimizer SSRF fix.
- better-auth below 1.7.7 has a critical magic-link account takeover (GHSA-965c-763c-88jm). Never downgrade.
- `@cloudflare/vitest-pool-workers` is deprecated and renamed `@cloudflare/vitest-plugin`. cr-001 updates the plugin to 1.4.2 for security fixes; npm verified 2026-10-14, peer vitest ^4.1.0 or ^5.0.0. Existing Vitest stays 4.1.11.
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

Script block in `web/package.json`, confirmed against the manifest on 2026-10-12. Run from `web/`. `e2e` is planned and lands with Playwright.

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
| Verify dev release | `npm run verify:dev` (read-only binding metadata plus anonymous route and invalid-code checks; no mail/signup) |
| Test | `npm test` (`vitest run`) |
| Deployment boundary and R2 audit tests | `npm run test:deploy` (17 Node tests for branch/environment/account checks and conservative R2 audit policy) |
| Inspect R2 resources and usage | `npm run audit:r2` (read-only API inspection; exit 1 unsafe/incomplete resource inspection, exit 2 warnings/incomplete billing access; never a spending cap) |
| End-to-end | `npm run e2e` (`playwright test`) |
| Lint | `npm run lint` (`eslint`) |
| Typecheck | `npm run typecheck` (`tsc --noEmit` for the app, then for `tests/`) |
| Generate migration | `npm run db:generate` (`drizzle-kit generate`) |
| Apply migrations locally | `npm run db:migrate:local` (`wrangler d1 migrations apply flag-db --local`) |
| Apply migrations remote | `npm run db:migrate:remote` (production), `npm run db:migrate:dev` (dev); no environment named preview exists |
| Cloudflare binding types | `npm run cf-typegen` (`wrangler types --env-interface CloudflareEnv --strict-vars false`) |
| Docs validator | `python $SPINE_HOME/scripts/check.py docs/` (from repo root) |

Long-running commands (dev servers, watchers) must be run by the owner in their own terminal, not by an agent in a blocking shell call.

### 3.1 Deploy and migrations (read before any schema change)

Cloudflare Workers Builds is intended to deploy `flag` from `main` and `flag-dev` from `dev`, with root directory `web` for both. Configure separate build and deploy commands: production uses `npm run build:worker` then `npm run deploy:worker`; dev uses `npm run build:worker:dev` then `npm run deploy:worker:dev`. Each service's production branch must match its intended branch. Non-production branch builds are optional and need explicit preview/upload commands and environments; do not use the full deploy scripts as the build command. Set watch paths to application changes if documentation-only builds are unwanted.

Evidence from the 2026-10-14 audit: supplied build log ran a deployment during the build and then a second deployment without --env dev, overriding only the Worker name. Historical flag-dev version a9393ce2 used production DB/auth values; active version 222b8b96 used the correct dev values. A green build alone does not prove isolation. After deployment verify the actual version's DB binding and BETTER_AUTH_URL. GitHub's original flag-dev failure had no inline error and its build API required unavailable Workers CI permissions. Only the checks for deliberately configured branches should run; do not dismiss unexpected checks without inspecting their commands.

Reference, checked 2026-10-14: https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments and https://opennext.js.org/cloudflare/howtos/dev-deploy . Dashboard settings remain external configuration and must be verified separately from the repository scripts.

Push protection: web/open-next.config.ts:2 loads the CI check before adapter operations and propagates the selected environment to child commands. Plain Wrangler can bypass adapter config, so web/wrangler.jsonc:12 also invokes web/scripts/check-wrangler-build.mjs:1 before Wrangler uploads. web/scripts/check-ci-target.mjs:16 rejects a CI Worker-name/environment mismatch and rejects flag operations outside main or flag-dev operations outside dev. This prevents the old commands from promoting a dev commit to production or overriding only the dev Worker name while selecting production bindings. Correct dashboard commands are still required; incorrect commands deliberately fail. Cloudflare exposes WORKERS_CI_BRANCH per https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables .

**Database migrations are NOT automatic, and this is deliberate.** Auto-deploy ships code only. D1 migrations are forward-only with no automatic rollback, so they are applied by hand, preview before production. The trigger is mechanical: any change that adds or edits a file under `web/drizzle/` — i.e. any structural change to `web/src/server/db/schema.ts` (new table, new/renamed/removed column, index, constraint, CHECK, type, or default change) — needs a migration. Pure code, copy, styling, routing, or logic changes that use existing tables do NOT.

When schema changes, run these three steps in order, from `web/`:

1. Generate the migration: `npm run db:generate` (writes the next `drizzle/000X_*.sql`).
2. Apply backward-compatible migrations to the database BEFORE the code that needs them goes live:
   - preview DB: `npm run db:migrate:dev` (`wrangler d1 migrations apply flag-db-dev --remote --env dev`)
   - production DB: `npm run db:migrate:remote` (`wrangler d1 migrations apply flag-db --remote`)
3. Push the code only after the corresponding database is ready and the build commands above are verified; auto-deploy ships it. A destructive/renaming change needs an expand-and-contract rollout, not a blind migration ahead of running code.

cr-001 adds web/drizzle/0003_melted_the_twelve.sql for AUTH_RATE_LIMIT. Local and remote dev applications passed; dev release completed after explicit authorization on 2026-10-14. Production migration/deployment still need separate authorization. npm run verify:dev passed against active version bd7b2957-e125-4dfe-a4ea-41c139510ca6.

Issue #5 adds `web/drizzle/0004_clever_arclight.sql` for the four log/proof tables; a fresh local D1 application passed. Before an authorized remote release, provision the private R2 buckets named by `web/wrangler.jsonc:30` (flag-proofs) and `web/wrangler.jsonc:55` (flag-proofs-dev), with public r2.dev access and custom domains disabled, then apply migration 0004 to the target database. Remote provisioning, bucket privacy, and migration application have not been performed or verified by this local task. Local development uses emulated R2 (`remote: false`). `web/scripts/check-resource-bindings.mjs:2` checks environment-specific bucket, Worker, database, and auth URL before the guarded deploy command. Nine Node deployment tests now include actual Wrangler config isolation and rejection of missing/swapped/remote-preview proof bindings, plus regression checks for database/auth/Worker drift.

2026-10-21 follow-up: owner enabled R2 and requested CLI provisioning/cost checks. Both configured buckets were provisioned at 2026-10-20 15:56 UTC as Standard, empty, with public r2.dev disabled, no custom domains, and Sippy disabled; read back through Cloudflare APIs and Wrangler info. `web/wrangler.jsonc:5` pins the approved account, and deployment checks reject missing/different account IDs. `web/scripts/audit-r2.mjs:1` rechecks bucket safety, all active deployment versions for both Workers, and shared account R2 analytics over a rolling 31-day window. The command does not upload/read proof contents, mutate resources, provision subscriptions, or deploy. It uses CLOUDFLARE_API_TOKEN when supplied, otherwise the existing Wrangler OAuth login, without printing the token. Current OAuth access returns 403 for subscriptions/notification policies, so Workers plan, invoices, and alerts remain unverified. The audit must report those limitations; it cannot establish a hard $0 spending cap. Superseded 2026-10-21 by the live check below: dev migration 0004 is applied and flag-dev runs the merged code.

2026-10-21 live dev status (read-only Wrangler checks): flag-db-dev reports no migrations to apply, so 0004 is applied; flag-dev version 765e86dd (deployed 2026-10-20 17:01 UTC after PR #11 merged to dev) binds flag-proofs-dev; dev log/proof tables hold 0 rows. Production flag-db still lacks 0003 and 0004, and main is six commits behind dev. Applying 0003 and 0004 to flag-db must precede any dev-to-main merge, or production sign-in fails on the missing AUTH_RATE_LIMIT table.

Branch fix-otp-limit-log-parties adds `web/drizzle/0005_happy_vermin.sql`: UNIQUE ENGAGEMENT(id, freelancer_id, client_id) and a composite ENGAGEMENT_LOG foreign key to it. SQLite cannot add a foreign key in place, so the migration rebuilds engagement_log (copy, drop, rename); the table is empty on dev, so the rebuild carries no data risk there. Apply it to flag-db-dev before or with the merge to dev. The same branch adds `@better-auth/core` 1.7.7 as a direct pinned dependency (already installed transitively at that version) for IP normalization.

Failure mode if skipped: the deploy succeeds but the live page throws a database error because the table or column it expects does not exist yet (local works because the local D1 was already migrated). The fix is simply to run the matching migrate command.

---

## 4. Repo conventions

| Area | Convention |
|------|-----------|
| Branch policy | `main` is graded and deployed to production. `dev` integrates and deploys to preview. Feature branches `f<n>-<short-name>` off `dev`, merged by pull request with one review from another developer. `foverhaul` holds this rewrite until it merges to `dev` |
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
- [ ] Policy source aligns with the approved scope; verify the 2026-10-14 versions on the deployed legal pages before release

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
