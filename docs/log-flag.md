---
spine_type: LOG
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

# Session Log: FLAG

---

## 1. Decisions

| Date | Decision | Rationale | Docs touched |
|------|----------|-----------|--------------|
| 2026-09-14 | Bootstrap Tier 2 with slug flag | Owner requested tier 2; app has users, state, and a deploy target | INDEX, IDEA, BUILD, LOG, PRD, SDD |
| 2026-09-14 | Scope pinned as awareness-only; no escalation, legal, or dispute module | Owner idea states FLAG is not a legal or dispute-resolution tool | IDEA, PRD |
| 2026-09-14 | Six Must-Have features F1-F6 carried from owner core features | Owner listed verification, structured reports, proof, moderation, reply, aggregation | PRD, SDD, INDEX |
| 2026-09-14 | Stack and commands left as TBD(owner) | No manifest exists in the repo; versions must be read, not guessed | BUILD |
| 2026-09-14 | Throwaway prototype on dev against Draft docs (owner override) | Owner said proceed; Next.js 16 + Tailwind v4 + motion + lucide in prototype/, mock data only, docs stay Draft | LOG |
| 2026-09-14 | Unslop pass: Ledger/Newspaper direction, docs terms out of UI | Removed PRD-F* from UI; serif headlines + mono meta + sans body; ledger rows replace pills/gradients; fixed scroll-behavior warning | LOG |
| 2026-09-14 | Scope shift to balanced engagement log with FLAG-M6 | Incident-only skewed base rate and read as wall of shame; balanced outcomes give context, keep same proof and review bar, show ratio never score; anti-gaming via per-client rate limits | IDEA, PRD, SDD, INDEX |
| 2026-09-14 | Prototype v2: scroll-driven ledger plus balanced data | Scroll-shrinking serif hero, velocity-reactive strip, vertical-drives-horizontal client rail, ratio-first cards and timelines; data now 96 engagements with outcome split | LOG |
| 2026-09-14 | Revamp to Sovrun language: Lenis, display scale, draggable, tabs, dark scale | Studied sovrun.org: Lenis smooth, specimen labels, huge display, draggable elem, tabs, dark scaling section, red/blue on off-white/black; rebuilt hero, rail, footer around balanced log | LOG |
| 2026-09-14 | Fullscreen pass: floating blend header, 100svh hero, no boxed cards | Removed specimen top bar and boxed grids; header is fixed mix-blend overlay, hero scales fullscreen, files list is full-bleed rows with invert hover | LOG |
| 2026-09-14 | Tackle docs without locking: pin prototype stack and commands in BUILD | Read prototype/package.json versions with dates and URLs; product store and hosting stay TBD; all docs remain Draft per owner | BUILD, INDEX, LOG |

## 2. Open questions

| ID | Raised | Question | Blocking | Status |
|----|--------|----------|----------|--------|
| Q1 | 2026-09-14 | How is freelancer verification performed and who reviews edge cases? | PRD-F1, SDD section 2 | Open |
| Q2 | 2026-09-14 | How is client identity resolved and deduped without misattribution? | PRD-F6, SDD sections 3-4 | Open |
| Q3 | 2026-09-14 | What proof standard publishes versus rejects a report, and who staffs moderation? | PRD-F3, PRD-F4 | Open |
| Q4 | 2026-09-14 | What is the deployment target, stack, and hosting budget? | SDD section 1, BUILD sections 2-3 | Open |
| Q5 | 2026-09-14 | What data-retention and takedown policy governs IDs, proofs, and replies? | SDD section 5, BUILD section 5 | Open |
| Q6 | 2026-09-14 | Confirm frontmatter owner handle to replace TBD(owner) | All docs | Open |
| Q7 | 2026-09-14 | What per-client and per-network rate limits block praise-stuffing and pile-ons without silencing real clusters? | PRD-F2, SDD section 5 | Open |

## 3. Resolved questions

| ID | Resolved | Question | Answer |
|----|----------|----------|--------|
| - | | | |

## 4. Dead ends

Approaches tried and abandoned.

| Date | Approach | Why it failed |
|------|----------|---------------|
| - | | |
