# SPINE pointer

This project uses **SPINE** (Structured Project Intelligence Engine) via a
zero-footprint pointer. SPINE rules are not duplicated here. Fetch the canonical
engine at session start and follow it.

**Pinned engine:** SPINE 0.3.0
**Source repo:** https://github.com/slvdrvncntjvr/spine
**Tag:** v0.3.0
**local_fallback:** `C:/Users/Vincent/spine`

## How to operate SPINE in this repo

1. **Session start — read the engine.** Resolve in this order, stop at first hit:
   - `$SPINE_HOME/AGENTS.md` if the `SPINE_HOME` env var is set
   - `C:/Users/Vincent/spine/AGENTS.md` (local_fallback above)
   - `~/.spine/engine/AGENTS.md`
   - `https://raw.githubusercontent.com/slvdrvncntjvr/spine/v0.3.0/AGENTS.md`

   Local first is deliberate. Do not make a network call the precondition for
   doing any work. If all four fail, say so and stop rather than improvising a
   doc format.

2. **Re-ground from the docs, not the chat.** Run engine §7.0 every session and
   after context compaction: read `docs/index.md`, the upstream chain for the
   task, and `IDEA` §4.1 invariants; run the validator; run
   `python <resolved root>/scripts/checkpoint.py verify` if checkpoints exist.
   If the owner says something is wrong or you find a dangling ID, follow
   engine §7.8 recovery. Never restore docs or rewrite history without the
   owner's go-ahead.

3. **Templates on demand.** When a trigger phrase matches a document type, read
   `<resolved root>/templates/<CODE>_Template.md`. Read the
   `> **Agent Instructions**` blockquote before writing anything.

4. **Validate after generating.**
   `python <resolved root>/scripts/check.py docs/` (add `--strict` for CI).

5. **Cockpit.** Only on explicit request:
   `python <resolved root>/scripts/cockpit.py .` → writes `cockpit.html` at the
   repo root. Generated artifact; it is in `.gitignore`.

6. **Output location.** `docs/index.md` plus `docs/<code>-<slug>.md`. Stamp
   "Built on SPINE 0.3.0" into `docs/index.md`.

## Project-specific rules

<!-- Add repo-specific conventions below. The engine defers to this section for
     repo-specific matters (stack, commands, branch policy) but not for the
     Hard Rules in engine §8. -->

_None yet._
