# ADR 0123 — Artifacts after a trim: `artifact list`, and a collapsed turn names the artifacts it changed

Status: accepted, 2026-11-09. Asked of the product owner after a real chat lost its artifacts; both decisions were
chosen together (recommended over either one alone). It amends plan 08 §8.1 and §8.5, ADR 0063, and ADR 0108, 5.

## Context

In a chat of 13 turns, the agent wrote `research-app-review` and `research-improvements-review` in its fourth to
seventh turns, then worked on through a long turn. When the prompt passed 60,000 tokens, the trim (ADR 0108, 5)
collapsed every turn through `seq` 137: each was sent as the person's message and its final answer, which named the
artifact by its title only. The calls and results that held the ids weren't sent any more. The chat had no summary,
whose `facts` list the artifacts (ADR 0066, 2), and the `artifact` connector had no way to list them: `write`, `edit`,
`get`, `delete`, and `help`, although `write`'s 20-artifact error already says "artifact list names them". After
"Continue.", the agent guessed three ids, got `NOT_FOUND` three times, and asked the person to paste the list.

## Decisions

1. **`artifact list {}`** lists the chat's artifacts, newest change first: `[{ "id", "title", "format", "version",
   "updatedAt" }]`, a subagent its chat's, as `kvcoder.artifact.list` orders them (artifact id breaking a tie). It is
   the private query `kvcoder.artifact.entry.list`, taking `{ sessionId, payload: {} }` as every connector command
   does, and never asks. The person's `kvcoder.artifact.list` doesn't change.
2. **A collapsed turn names the artifacts it changed.** When a collapsed turn has a successful `artifact write` or
   `artifact edit` (its result's `isError` false and its `details.artifact` set, ADR 0009, 177), its final answer is
   sent with the line `[kvman: artifacts changed in this turn: <id> (<title>), …]` after the files line, one entry per
   id, sorted by id, with the title of that id's last such result in the turn. It is read from the turn's stored
   messages alone, so it never changes once sent and the provider's cache holds: an artifact deleted or retitled later
   is still named as the turn left it, and `artifact list` gives the chat's artifacts as they are now. A turn whose
   only artifact calls failed, or that has none, has no such line.
3. **A helper has `list` as well as `get`** (asked while building; recommended over keeping `list` to the lead). Both
   only read, and a helper still writes, edits, and deletes no artifact (ADR 0063, 1).
