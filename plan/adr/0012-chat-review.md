# ADR 0012 — kvcoder and kvai: what a real chat showed

Status: accepted, 2026-10-05. It changes ADR 0011 (3 and 11), ADR 0009 (150, 163, 180, and 213), plan 07 §7.1, and plan 08 §8.2, §8.3, and §8.5 where they differ.

Asked: "Are you able to access my conversation in the running app instance right now and determine the issues and give suggestions for optimization?", then "fix all but ask me questions for every one to confirm the solution". The chat was one build of a to-do page on `openai/gpt-6-luna`: 2 turns, 22 model calls. 8 of the 22 calls only learned a payload shape (4 failed `VALIDATION_FAILED`, 4 were `help`), 34% of the input tokens were cache reads, a background process that crashed was reported as `[exit code 0]`, and its crash reached the model twice.

## Decisions

1. **The prompt gives the payload of every command of kvcoder's six connectors.** In the connector index, `shell`, `fs`, `artifact`, `background`, `ask`, and `subagent` are listed as their name and description, then one line per command, `help` last: the command's name and its signature (decision 3). A registered connector and a binary connector keep `Commands: <names>, help.` and learn payloads from `help`. Chosen over signatures for every connector, and over names only. It changes ADR 0011 (3).
2. **An invalid payload returns its problems, then the command's signature**, in place of the indented JSON Schema: `error VALIDATION_FAILED: <problems>. The payload of <connector> <command> is`, then the signature on its own line. This holds for every connector. Chosen over a one-line JSON Schema and over the full schema. It changes ADR 0009 (213).
3. **A signature is generated from the payload's JSON Schema**: `{ a, b?, c: [{ x, y? }], d: { p }, mode: "fresh" | "fork" }`. A field is its name, with `?` when it isn't required; an object field with properties is expanded, and so is an array whose items are such an object; a field whose schema is an enum of strings lists its values, `format?: "markdown" | "html" | "url"`; any other field is its name only. Fields keep the schema's order, and a payload with no field is `{}`. Chosen over names only.
4. **A payload schema that isn't a plain object has no signature.** Its error carries the JSON Schema on one line, without `$schema`: `The payload of <connector> <command> is (JSON Schema):`, then the schema. Chosen over pointing to `help`.
5. **One question per `ask` call.** The prompt says to put each question in its own `ask` call, all the calls in one reply, and to use `ask choice` whenever options are offered, the recommended one first. Nothing else changes: the calls of a reply already start together, and the turn waits on every pending question. Chosen over a new command `ask form`, and over one question per reply.
6. **`kvai.complete` takes `sessionId?`**, a non-empty string that names the conversation a call belongs to. kvai passes it to pi-ai as `sessionId`, which sends it as the provider's prompt cache key and session affinity; a delegate command receives it with the rest of the input. kvcoder passes the chat's own id for a step, a compaction, and a title; a subagent's calls carry the child session's id. Chosen over the name `cacheKey`, and over a key that kvai derives from the prompt.
7. **A background start reports what really happened.** After the startup second:
   - the process exited: `started <id>`, the output so far, `[the process has already ended]`, then `[exit code N]` with its real code; the result is an error when the code isn't 0;
   - a signal killed it: the same, ending `[killed by <signal>]` with no exit-code line; the result is an error;
   - it still runs: `started <id>`, the output so far, then `[running]`, with no exit-code line.
   Chosen over keeping `[exit code 0]` for a running process, and over no exit line at all; `[killed by <signal>]` over the shell's 128 + N. It changes ADR 0011 (11).
8. **An exit inside the startup second isn't reported twice.** The start result carries it, so no background message is added. An exit after the startup second adds the message as before. Chosen over a short message, and over both.
9. **The process record decides.** The start call reads the end from the record that the `kernel.process.exited` handler writes. If the process has died but its end isn't recorded when the startup second ends, the result says `[running]`, and the end arrives as the usual background message with its code. Chosen over a way for `ctx.processes` to give an ended process's exit code.
10. **The prompt asks for a check before a claim.** Step 4 gains: before saying that something runs or works, the model checks it the way the person would (runs it, requests its address, or runs its test), and when it couldn't, says what is unchecked. Chosen over a rule for started servers only.
11. **A plan only for a larger task.** The prompt names the threshold: a task of one file or a few steps needs no plan. The `artifact` connector's description says "when you write a plan, keep it in the artifact `plan`" in place of "keep your plan in the artifact `plan`". Chosen over a plan for every task ticked once at the end.
12. **An empty `path` is the workspace folder** for `fs list` and `fs search`, the same as leaving it out. `fs read`, `fs write`, and `fs edit` still refuse an empty path.
13. **Where a server listens is left alone.** The model started a preview on `0.0.0.0`; the product owner chose no prompt rule and no approval rule: the shell is the person's real shell, and `risky` with `kvcoder.shell.approval` already covers a risky line.

## Confirmed details

14. The signature and the prompt's lines come from the same generator, so they can never differ. The prompt's lines are indented by 2 spaces, with the command names padded to the widest one of the connector.
15. The base prompt's sentence about `help` becomes: a command listed with its payload needs no `help` call; for any other command, and for what a field means, the model calls the connector's `help` before the first use.
16. Decision 8 covers an exit only. A process that the person stops inside its startup second is reported by the person's stop, as before, and its start result ends `[the process has already ended]` with no code line.
17. The process record gains `starting`, true from the start until the startup second ends; a record stored before this change has none and counts as not starting.

## Consequences

- Plan 07 §7.1 and plan 08 §8.2, §8.3, and §8.5 are corrected.
- The scenarios are in `milestones/QA19-TEST-CASES.md`. Tests of earlier milestones that asserted the JSON Schema in an error, `Commands:` for a built-in connector, or `[exit code 0]` for a background start are rewritten and keep their ids.
- Changesets: `@kvman/kvcoder` and `@kvman/kvai`.
