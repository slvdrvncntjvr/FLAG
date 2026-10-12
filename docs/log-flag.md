---
spine_type: LOG
spine_version: 0.3.0
project: FLAG
slug: flag
doc_version: 0.3
status: Draft
owner: slvdrvncntjvr
created: 2026-09-14
updated: 2026-10-12
reconciled: 2026-09-14
---

# Session Log: FLAG

---

## 1. Decisions

| Date | Decision | Rationale | Docs touched |
|------|----------|-----------|--------------|
| 2026-10-12 | Transactional email via Brevo free tier (300/day, no custom domain); `sendMail` selects Brevo if `BREVO_API_KEY` set, else Resend, else dev-console no-op | All-free requirement with no domain yet; MailChannels' free Cloudflare path ended in 2024; fetch-based, no new dependency | BUILD, SDD |
| 2026-10-12 | Deploy on Cloudflare Workers Free plan to `*.workers.dev` (`flag.factsfirst.workers.dev`); no custom domain or Workers Paid for now; resolves Q4 | Owner: all free. Bundle gzip ~1.76 MiB fits the 3 MiB free limit; verified by `wrangler deploy --dry-run` | BUILD, SDD, OPS, INDEX |
| 2026-10-12 | Two environments: production (`flag`/`flag-db`, branch `main`) and preview (`flag-dev`/`flag-db-dev`, branch `dev`), separate D1 and per-env secrets | Owner wants separate production and preview links; separate DB keeps test data out of prod | BUILD, OPS |
| 2026-10-12 | `main`→prod auto-deploys via Workers Builds; `dev`→preview deploys manually with `npm run deploy:dev` | Cloudflare bug workers-sdk #15682 breaks non-production branch builds (dead `WRANGLER_CI_MATCH_TAG`); manual preview until fixed | BUILD, OPS |
| 2026-10-12 | Privacy notice and terms shipped as real copy (RA 10173 data-subject rights; contact `slvdrvncntjvr@gmail.com`); DRAFT banner removed; resolves Q15 | Owner: "just handle it"; app needed non-draft legal text to serve real users | PRD |
| 2026-10-12 | Client IP for rate limits read from `cf-connecting-ip`, not the default `x-forwarded-for` | The default header can be spoofed by the client, letting anyone dodge the limits | SDD |
| 2026-10-12 | Google sign-in and Turnstile stay disabled (no-op without keys); email-code sign-in is the sole auth method for launch | Keys/domain not available; email-code auth is complete and sufficient | SDD, BUILD |
| 2026-10-12 | Harden email-code input: strip non-digits from the OTP and trim email before submit | Pasted/autofilled codes carried whitespace and failed the exact hash match intermittently | SDD |
| 2026-10-12 | Test pool pinned as `@cloudflare/vitest-plugin` 1.3.6 instead of `@cloudflare/vitest-pool-workers` 0.23.0 | The old package is deprecated and renamed; 1.3.6 is the newest release past the 7-day wait | BUILD |
| 2026-10-12 | `USER.role` is null until the user picks freelancer or client at onboarding; it can be picked once and never as moderator or admin | Email-code sign-in creates the account before a role is known; AB-12 forbids role from the request payload | SDD |
| 2026-10-12 | Better Auth admin plugin not used; ban checked in a session hook, staff roles granted by a FLAG admin action | The plugin adds impersonation, which no PRD feature needs | SDD |
| 2026-10-12 | Turnstile on sign-up deferred until site and secret keys exist | Keys are not issued yet; sign-in is rate limited by Better Auth in the meantime | SDD |
| 2026-10-12 | Owner authorizes building PRD-F7 and PRD-F8 against Draft docs on `foverhaul`; docs checkpoint `spine-cp-2026-10-12-1` taken first | Owner: "proceed with the next steps"; Week 1-2 of the course schedule | LOG, BUILD |
| 2026-10-12 | Retire `prototype/`; build a fresh app in `web/` on the `foverhaul` branch | Owner: fresh app, docs first. Static export cannot do auth, uploads, or moderation | BUILD, SDD, INDEX |
| 2026-10-12 | Re-initialize SPINE at 0.3.0, tier 3; add QAD, OPS, and RFC 001 | Real launch with personal data and named businesses; owner re-ran init | INDEX, all |
| 2026-10-12 | Eight invariants INV-1 to INV-8 | Owner selected all eight proposed must-never rules | IDEA, PRD, SDD, BUILD, QAD, INDEX |
| 2026-10-12 | Owner handle `slvdrvncntjvr` in frontmatter | Owner answer; resolves Q6 | all |
| 2026-10-12 | Client model: engagement handshake; clients must register and accept before a log is possible; no profiles created on someone's behalf | Owner wants being on the platform to be the premise for being logged; consent cuts libel and misattribution risk; resolves Q2 | IDEA, PRD, SDD |
| 2026-10-12 | Balanced outcomes kept, plus corroboration limited to freelancers with their own accepted engagement with that client | Reconciles the repo pivot with the course Goal 4 upvote; the restriction blocks pile-ons | PRD, SDD |
| 2026-10-12 | Clients do not browse or recruit freelancers | Owner: not a marketplace | IDEA, PRD |
| 2026-10-12 | Client records visible to signed-in users only, never indexed | Owner choice; defamation and scraping exposure | IDEA, PRD, SDD |
| 2026-10-12 | Verification: phone code, portfolio link, PhilID QR signature check storing only an HMAC of the PCN, then moderator approval | Course Goal 2 requires ID validation; owner wanted an alternative to storing IDs; resolves Q1 in part | PRD, SDD, RFC 001 |
| 2026-10-12 | Proof files visible to moderators, the filer, and the named client only | Owner choice; Data Privacy Act exposure | IDEA, PRD, SDD |
| 2026-10-12 | Moderation staffed by the project team during the pilot | Course docs: admin moderation by the team; resolves Q3 in part | IDEA, PRD |
| 2026-10-12 | English only; plain, factual copy with no filler phrasing | Owner | IDEA, BUILD |
| 2026-10-12 | Interface direction: civic record (public-record explorer, docket), replacing the Sovrun marketing style in the app | Owner chose "rethink the look" then "civic record"; research showed scroll-heavy motion hurts low-end Android | BUILD |
| 2026-10-12 | Stack: Next 16.3.8 on OpenNext Cloudflare 1.20.10, D1 with Drizzle, R2, Better Auth 1.7.7, shadcn on Base UI | Owner chose Cloudflare; versions checked on npm 2026-10-12; OpenNext requires Next 16.3.8 or newer; Better Auth below 1.7.7 has a critical advisory; resolves Q4 in part | BUILD, SDD |
| 2026-10-12 | Proofs stream through the Worker; no presigned URLs | Presigned PUT cannot enforce size; presigned GET links can be shared | SDD |
| 2026-10-12 | Module ownership per developer under `web/src/features/<module>` | Owner choice; three developers working in parallel | BUILD |
| 2026-09-14 | Bootstrap Tier 2 with slug flag | Owner requested tier 2; app has users, state, and a deploy target | INDEX, IDEA, BUILD, LOG, PRD, SDD |
| 2026-09-14 | Scope pinned as awareness-only; no escalation, legal, or dispute module | Owner idea states FLAG is not a legal or dispute-resolution tool | IDEA, PRD |
| 2026-09-14 | Six Must-Have features F1-F6 carried from owner core features | Owner listed verification, structured reports, proof, moderation, reply, aggregation | PRD, SDD, INDEX |
| 2026-09-14 | Stack and commands left as TBD(owner) | No manifest exists in the repo; versions must be read, not guessed | BUILD |
| 2026-09-14 | Throwaway prototype on dev against Draft docs (owner override) | Owner said proceed; Next.js 16 + Tailwind v4 + motion + lucide in prototype/, mock data only, docs stay Draft | LOG |
| 2026-09-14 | Unslop pass: Ledger/Newspaper direction, docs terms out of UI | Removed feature IDs from UI; serif headlines + mono meta + sans body; ledger rows replace pills/gradients; fixed scroll-behavior warning | LOG |
| 2026-09-14 | Scope shift to balanced engagement log with FLAG-M6 | Incident-only skewed base rate and read as wall of shame; balanced outcomes give context, keep same proof and review bar, show ratio never score; anti-gaming via per-client rate limits | IDEA, PRD, SDD, INDEX |
| 2026-09-14 | Prototype v2: scroll-driven ledger plus balanced data | Scroll-shrinking serif hero, velocity-reactive strip, vertical-drives-horizontal client rail, ratio-first cards and timelines; data now 96 engagements with outcome split | LOG |
| 2026-09-14 | Revamp to Sovrun language: Lenis, display scale, draggable, tabs, dark scale | Studied sovrun.org: Lenis smooth, specimen labels, huge display, draggable elem, tabs, dark scaling section, red/blue on off-white/black; rebuilt hero, rail, footer around balanced log | LOG |
| 2026-09-14 | Fullscreen pass: floating blend header, 100svh hero, no boxed cards | Removed specimen top bar and boxed grids; header is fixed mix-blend overlay, hero scales fullscreen, files list is full-bleed rows with invert hover | LOG |
| 2026-09-14 | Tackle docs without locking: pin prototype stack and commands in BUILD | Read prototype/package.json versions with dates and URLs; product store and hosting stay TBD; all docs remain Draft per owner | BUILD, INDEX, LOG |

## 2. Open questions

| ID | Raised | Question | Blocking | Status |
|----|--------|----------|----------|--------|
| Q14 | 2026-10-12 | Which developer owns which `web/src/features` module? | BUILD §4 | Open |
| Q13 | 2026-10-12 | Where does PSA's PhilID signing key come from, what exact bytes are signed, and can ePhilID v3 be checked offline? | RFC 001 §4 | Open |
| Q12 | 2026-10-12 | Which SMS provider sends phone codes, and who pays? | PRD-F1, SDD §5 | Open |
| Q11 | 2026-10-12 | What is the corroboration target for FLAG-M7? | PRD §5 | Open |
| Q10 | 2026-10-12 | How long is the client's reply window around publication? | PRD-F5 | Open |
| Q9 | 2026-10-12 | What proof standard approves versus rejects a log? | PRD-F4 | Open |
| Q8 | 2026-10-12 | What does a freelancer without a PhilID or ePhilID use to verify, given INV-3? | PRD-F1, RFC 001 | Open |
| Q1 | 2026-09-14 | How is freelancer verification performed and who reviews edge cases? | PRD-F1, SDD section 2 | Partly answered 2026-10-12; remainder is Q8 and Q13 |
| Q2 | 2026-09-14 | How is client identity resolved and deduped without misattribution? | PRD-F6, SDD sections 3-4 | Resolved 2026-10-12 |
| Q3 | 2026-09-14 | What proof standard publishes versus rejects a report, and who staffs moderation? | PRD-F3, PRD-F4 | Partly answered 2026-10-12; remainder is Q9 |
| Q4 | 2026-09-14 | What is the deployment target, stack, and hosting budget? | SDD section 1, BUILD sections 2-3 | Resolved 2026-10-12: Cloudflare Workers Free plan, `*.workers.dev`, no custom domain |
| Q5 | 2026-09-14 | What data-retention and takedown policy governs IDs, proofs, and replies? Who is the data protection contact? | SDD section 5, BUILD section 5 | Partly answered 2026-10-12: contact is `slvdrvncntjvr@gmail.com`; retention/takedown policy still open |
| Q6 | 2026-09-14 | Confirm frontmatter owner handle to replace TBD(owner) | All docs | Resolved 2026-10-12 |
| Q7 | 2026-09-14 | What per-client and per-network rate limits block praise-stuffing and pile-ons without silencing real clusters? | PRD-F2, SDD section 5 | Open |

## 3. Resolved questions

| ID | Resolved | Question | Answer |
|----|----------|----------|--------|
| Q15 | 2026-10-12 | Who writes the privacy/terms text | Real copy written and shipped (RA 10173 rights, contact `slvdrvncntjvr@gmail.com`); DRAFT banner removed. Final legal review by the team still advisable |
| Q4 | 2026-10-12 | Deployment target, stack, budget | Cloudflare Workers Free plan on `*.workers.dev` (`flag.factsfirst.workers.dev`); no custom domain or paid plan |
| Q6 | 2026-10-12 | Owner handle | `slvdrvncntjvr` |
| Q2 | 2026-10-12 | Client identity and dedupe | Clients register their own account and profile through an engagement invite; there are no profiles created from reports, so there is nothing to dedupe or misattribute |

## 4. Dead ends

Approaches tried and abandoned.

| Date | Approach | Why it failed |
|------|----------|---------------|
| 2026-10-12 | Auto-deploy preview on push to `dev` via Workers Builds non-production branch builds | Cloudflare bug workers-sdk #15682: branch builds get a `WRANGLER_CI_MATCH_TAG` that belongs to no Worker, so every preview deploy fails the name check. Preview deploys manually via `npm run deploy:dev` until fixed |
| 2026-10-12 | Static export (`output: "export"`) to Cloudflare Workers static assets | Cannot run auth, uploads, or moderation; replaced by OpenNext on Workers |
| 2026-10-12 | Sovrun-style motion (Lenis, scroll scaling, draggable cards) across the product | Heavy input latency on low-end Android and in the Messenger webview; reads as marketing, not as a record |

## 5. Recoveries

| Date | Checkpoint | What went wrong | Resolution | Docs restored |
|------|------------|-----------------|------------|---------------|
| — | | | | |
