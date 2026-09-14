---
spine_type: BUILD
spine_version: 0.2.0
project: FLAG
slug: flag
doc_version: 0.1
status: Draft
owner: TBD(owner)
created: 2026-09-14
updated: 2026-09-14
reconciled: 2026-09-14
---

# Build Guide: FLAG

**IDEA:** [idea-flag.md](idea-flag.md)
**PRD:** [prd-flag.md](prd-flag.md)
**SDD:** [sdd-flag.md](sdd-flag.md)

---

## 1. How to build from these docs

Read in this order before writing code:

1. docs/index.md
2. IDEA - scope, and especially section 4 Out of Scope
3. PRD - the feature you are implementing, by ID
4. SDD - how it fits the system
5. The RFC for that feature, if one exists
6. This guide
7. QAD - before calling anything done (note: QAD is N/A at tier 2; add it when the project grows to tier 3)

**Only build against Locked docs.** If the doc you need is Draft, ask before proceeding.

### To build X, read Y

| To implement... | Read | Verify against |
|---------------|------|----------------|
| A feature PRD-F# | PRD, then SDD, then RFC if one exists | PRD section 3.1 acceptance criteria |
| A schema change | SDD data model | Migration applies cleanly and is backward compatible |
| An API endpoint | SDD API surface | PRD acceptance plus moderation and reply rules |
| A UI surface | PRD plus SDD components | Aggregation shows engagements plus outcome share and tag distribution, never a score and never single call-outs |

---

## 2. Pinned stack

Prototype stack read from prototype/package.json on 2026-09-14. Product datastore, file store, and hosting are still TBD(owner); prototype uses mock data with no backend.

| Layer | Technology | Version | Verified | Source |
|-------|-----------|---------|----------|--------|
| Language | TypeScript | 5 (range ^5) | 2026-09-14 | https://www.typescriptlang.org/docs/ |
| Runtime | Node.js | 22.21.1 | 2026-09-14 | https://nodejs.org/en/docs |
| Framework | Next.js (App Router) | 16.3.5 | 2026-09-14 | https://nextjs.org/docs |
| UI | React + React DOM | 19.2.8 | 2026-09-14 | https://react.dev/ |
| Styling | Tailwind CSS v4 (+ @tailwindcss/postcss v4) | 4 (range ^4) | 2026-09-14 | https://tailwindcss.com/docs |
| Motion | motion (motion/react) | 13.2.0 | 2026-09-14 | https://motion.dev/docs |
| Scroll | lenis | 1.3.26 (range ^1.3.26) | 2026-09-14 | https://github.com/darkroomengineering/lenis |
| Icons | lucide-react | 1.46.0 (range ^1.46.0) | 2026-09-14 | https://lucide.dev/ |
| Utils | clsx 2.1.1, tailwind-merge 3.7.0, class-variance-authority 0.7.1 | see manifest | 2026-09-14 | https://github.com/lukeed/clsx / https://github.com/dcastil/tailwind-merge |
| Fonts | Inter, Instrument Serif, IBM Plex Mono, Archivo Black via next/font/google | bundled by Next | 2026-09-14 | https://nextjs.org/docs/app/building-your-application/optimizing/fonts |
| Datastore | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| File storage for proof | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| Hosting | TBD(owner) | TBD(owner) | unverified | TBD(owner) |

### Known deprecations

APIs in this stack that look correct but are not, with the current replacement.

| Deprecated | Use instead | Since | Notes |
|-----------|-------------|-------|-------|
| `framer-motion` package import | `motion` package with `motion/react` import | 2026-09-14 | Prototype uses motion 13.2.0; old package name still resolves but is renamed |

---

## 3. Commands

Copied from prototype/package.json script block on 2026-09-14. Run from prototype/.

| Task | Command |
|------|---------|
| Install | `npm install --prefix prototype` |
| Dev | `npm run dev --prefix prototype` |
| Build | `npm run build --prefix prototype` |
| Start | `npm run start --prefix prototype` |
| Lint | `npm run lint --prefix prototype` |
| Typecheck | `npx tsc --noEmit -p prototype` (no dedicated script; TypeScript runs inside next build) |

Long-running commands (dev servers, watchers) must be run by the owner in their own terminal, not by an agent in a blocking shell call.

---

## 4. Repo conventions

| Area | Convention |
|------|-----------|
| Branch policy | Work on `dev`; prototype is throwaway against Draft docs, no lock yet |
| Commit format | Short imperative subject, e.g. `Prototype balanced log and Sovrun scroll` |
| Directory layout | `docs/` SPINE suite at root; throwaway Next.js app in `prototype/` (`app/`, `components/`, `lib/`); product API paths per SDD section 4 are planned, not on disk |
| Naming | Files kebab-case; components PascalCase; SPINE docs `docs/<code>-flag.md` |
| Error handling | UI surfaces field-level messages; product API format TBD(owner) - see SDD section 5 |
| Test location | TBD(owner) - prototype has no test runner yet; build plus lint are the gates |

---

## 5. Guardrails

Repo-specific prohibitions. These are enforced like engine section 8 Hard Rules.

- Never commit secrets. Secrets live in TBD(owner) secret store; env files stay gitignored.
- Awareness-only language: no legal advice, dispute, collection, or enforcement copy in product, docs, or code.
- No publishing path that bypasses moderation; no single-entry pages outside ratio-first aggregation; no scores, leaderboards, or endorsement badges.
- Same proof bar for positive and flagged entries; positives need a positive tag.
- Only implement against Locked requirements, by ID. Draft means discuss, not build.

---

## 6. Definition of done

- [ ] Implements a Locked requirement, by ID (prototype exception only: throwaway against Draft with owner override, logged)
- [ ] Build passes: `npm run build --prefix prototype`
- [ ] Lint passes: `npm run lint --prefix prototype`
- [ ] Lint and typecheck clean
- [ ] PRD section 3.1 acceptance criteria for the feature ID pass
- [ ] Docs updated if behavior changed; INDEX row bumped
