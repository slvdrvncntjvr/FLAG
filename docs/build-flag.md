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
| A UI surface | PRD plus SDD components | Aggregation shows counts plus tag frequency, never single call-outs |

---

## 2. Pinned stack

No manifest exists in the repo yet, so nothing below is pinned. Every row must be read from the real manifest once the stack is chosen - do not write a version from memory.

| Layer | Technology | Version | Verified | Source |
|-------|-----------|---------|----------|--------|
| Language | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| Framework | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| Datastore | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| File storage for proof | TBD(owner) | TBD(owner) | unverified | TBD(owner) |
| Hosting | TBD(owner) | TBD(owner) | unverified | TBD(owner) |

### Known deprecations

APIs in this stack that look correct but are not, with the current replacement.

| Deprecated | Use instead | Since | Notes |
|-----------|-------------|-------|-------|
| TBD(owner) | TBD(owner) | TBD(owner) | Stack not selected yet; fill once pinned |

---

## 3. Commands

Copied from TBD(owner) - no manifest script block exists yet.

| Task | Command |
|------|---------|
| Install | TBD(owner) |
| Dev | TBD(owner) |
| Build | TBD(owner) |
| Test | TBD(owner) |
| Lint | TBD(owner) |
| Typecheck | TBD(owner) |

Long-running commands (dev servers, watchers) must be run by the owner in their own terminal, not by an agent in a blocking shell call.

---

## 4. Repo conventions

| Area | Convention |
|------|-----------|
| Branch policy | TBD(owner) |
| Commit format | TBD(owner) |
| Directory layout | TBD(owner) - SDD section 2 locations are planned, not yet on disk |
| Naming | TBD(owner) |
| Error handling | TBD(owner) - see SDD section 5 once the stack is chosen |
| Test location | TBD(owner) |

---

## 5. Guardrails

Repo-specific prohibitions. These are enforced like engine section 8 Hard Rules.

- Never commit secrets. Secrets live in TBD(owner) secret store; env files stay gitignored.
- Awareness-only language: no legal advice, dispute, collection, or enforcement copy in product, docs, or code.
- No publishing path that bypasses moderation; no single-report call-out pages outside the aggregation view.
- Only implement against Locked requirements, by ID. Draft means discuss, not build.

---

## 6. Definition of done

- [ ] Implements a Locked requirement, by ID
- [ ] Build passes: TBD(owner)
- [ ] Tests pass: TBD(owner)
- [ ] Lint and typecheck clean
- [ ] PRD section 3.1 acceptance criteria for the feature ID pass
- [ ] Docs updated if behavior changed; INDEX row bumped
