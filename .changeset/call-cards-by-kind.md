---
'@kvman/kvcoder': minor
---

A call's card reads as what the call did (ADR 0036). Closed, it says what was done, to what, and the outcome ("Edit src/app.ts +7 −2", "Read notes.md Lines 24–98 of 120", "$ pnpm test"). Opened, each kind of call has its own view: an edit as a diff, a write and a read as numbered lines, a list as rows, a search as its matches under each file, and any other call as fields, never as escaped JSON; each line reads in its own direction. An edit, a write, and a failed call start open, and the approval card shows the same view of what it asks to allow. The custom component `kvcoder.call` now takes `{ description?, connector?, command?, payload?, line?, failed?, durationMs?, output? }`.

A finished background job's card shows how long it ran, and the artifact panel's titles stay on one line.

A summary no longer ends between a reply's calls and their results, which made OpenAI refuse every next step with "No tool call found for function call output"; a chat already stopped that way works again.
