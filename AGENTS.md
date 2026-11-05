# SPINE pointer

This project uses **SPINE** (Structured Project Intelligence Engine) via a
zero-footprint pointer. SPINE rules are not duplicated here. Fetch the canonical
engine at session start and follow it.

**Pinned engine:** SPINE 0.3.0
**Source repo:** https://github.com/slvdrvncntjvr/spine
**Tag:** v0.3.0
**local_fallback:** `C:/Users/Vincent/spine`

If the shared local checkout is at a different version, use the pinned local tag
without changing that checkout: `python scripts/spine.py engine` reads this
repo's exact engine; `python scripts/spine.py template CODE` reads its templates.
Run validation with `python scripts/spine.py check docs/` and checkpoint
verification with `python scripts/spine.py checkpoint verify`. The runner uses
an automatically cleaned OS temporary snapshot, never the repo's `temporary/`
folder. Keep this project on **SPINE 0.3.0** until the owner requests an upgrade.

## How to operate SPINE in this repo

1. **Session start — read the pinned engine.** Run
   `python scripts/spine.py engine`. The runner resolves the local source and
   reads its `v0.3.0` tag without changing the shared checkout. This avoids
   loading a different installed engine before the project's pinned one.
   If the runner is unavailable, resolve in this order, stop at first hit:
   - `$SPINE_HOME/AGENTS.md` if the `SPINE_HOME` env var is set
   - `C:/Users/Vincent/spine/AGENTS.md` (local_fallback above)
   - `~/.spine/engine/AGENTS.md`
   - `https://raw.githubusercontent.com/slvdrvncntjvr/spine/v0.3.0/AGENTS.md`

   Check the version before loading a local engine; use the pinned tag if it
   differs. Local first is deliberate. Do not make a network call the
   precondition for doing any work. If all four fail, say so and stop rather than improvising a
   doc format.

2. **Re-ground from the docs, not the chat.** Run engine §7.0 every session and
   after context compaction: read `docs/index.md`, the upstream chain for the
   task, and `IDEA` §4.1 invariants; run the validator; run
   `python scripts/spine.py checkpoint verify` if checkpoints exist.
   If the owner says something is wrong or you find a dangling ID, follow
   engine §7.8 recovery. Never restore docs or rewrite history without the
   owner's go-ahead.

3. **Templates on demand.** When a trigger phrase matches a document type, run
   `python scripts/spine.py template CODE`. Read the
   `> **Agent Instructions**` blockquote before writing anything.

4. **Validate after generating.**
   `python scripts/spine.py check docs/` (add `--strict` for CI).

5. **Cockpit.** Only on explicit request:
   `python <resolved root>/scripts/cockpit.py .` → writes `cockpit.html` at the
   repo root. Generated artifact; it is in `.gitignore`.

6. **Output location.** `docs/index.md` plus `docs/<code>-<slug>.md`. Stamp
   "Built on SPINE 0.3.0" into `docs/index.md`.

## Project-specific rules

<!-- Add repo-specific conventions below. The engine defers to this section for
     repo-specific matters (stack, commands, branch policy) but not for the
     Hard Rules in engine §8. -->

### Reading and documentation maintenance

The owner authorized a full context consolidation on `dev-2` on 2026-10-31
(cr-004). Keep SPINE 0.3.0 and all existing invariant meanings.

- Start with `docs/index.md`, IDEA §4–4.1, and the relevant feature/design/build
  sections. Load QAD or OPS only for testing or operations work. Read sections
  for the task, not the entire document suite.
- The active LOG is `docs/log-current-flag.md`. Its open questions and recoveries
  satisfy session orientation. The owner intentionally deleted the historical
  `docs/log-flag.md` and `archive/` on 2026-10-31. The current LOG records the
  resulting evidence gap; the pinned checkpoint still flags the deleted LOG.
  Do not restore history or suppress that finding without owner approval.
- Old change records and the deferred QR RFC are historical or
  optional references. Read them only to investigate a named decision or task.
  `.rgignore` excludes these files from default searches; use `rg --no-ignore`
  with an explicit historical path when investigation requires them.
- INDEX owns implemented/enabled/deployed status and remaining work. PRD owns
  product intent; SDD owns schema and technical contracts; BUILD owns commands;
  QAD owns acceptance coverage; OPS owns release procedures. Link instead of
  repeating status narratives.
- Update docs when intent, a contract, a command, current delivery state or an
  unresolved decision changes. Routine test output belongs in the task report;
  record only concise durable verification evidence. Do not append a full
  session transcript or reproduce tool receipts across documents.
- Code and tests establish what exists; approved requirements establish what
  should exist. Report a discrepancy, then correct it within the owner's task
  authorization. Do not promote unfinished design or old proposals into current
  behavior, invent owner decisions, or revive superseded release gates.
- Existing local source changes accompany this branch. `dev-2` is a local
  working branch, with no deployment target added by this consolidation.
