# ADR 0069 — smaller savings: a dropped connection is retried, an edit echoes less, helpers have a default model, and a project's commands go in its AGENTS.md

Status: accepted by the product owner on 2026-10-12, before source. It amends ADR 0050, 1, ADR 0034, 1, and ADR 0021, 20.

## Context

From the owner's chats: the person typed "continue" six times in one chat after a provider error; `fs edit` results were 13 to 15% of all the text calls returned; helpers were 24 to 46% of a chat's cost, each on the chat's own model; and each chat read `README.md` and `package.json` four to seven times to find how the project is built and tested.

## Decisions

1. **"terminated" is a failure a second try may fix.** A provider failure whose whole reason is `terminated` (the connection was dropped while the answer was read) is `transient`, so kvcoder retries it as it does a stream that ended early (ADR 0050, 1). "OpenAI Responses stream ended before a terminal response event" was already transient; the failures in the owner's chat were from the day before that fix.
2. **An edit returns the ends of what changed.** `fs edit` still returns `{ path, replacements, firstChangedLine, fromLine, content }`, and `content` still starts 3 lines before the first changed line and ends 3 after the last. When that is more than 13 lines, it holds the first 6 and the last 6 with the line `[… N lines not shown …]` between them, in place of up to 80 lines: the model wrote the lines between itself.
3. **`kvcoder.delegate.model`** (asked) is the model a helper uses when its worker names none: a model id, or `null` (the default) for the chat's own. A worker's own `model` still wins. It is on Coder's page beside the chat's model, as "Model for workers".

4. **A project's commands are kept in its `AGENTS.md`** (asked; chosen over a note kept by kvman, and over nothing). kvman already puts `AGENTS.md` in every prompt as the project's rules (ADR 0058, 3). The lead's Finish step says: when it found how the project is built, tested, or run and `AGENTS.md` doesn't say it, it adds a short Commands section there, as a file change with `risky: true`, so the person is asked first. There is no new storage, command, or setting.

## Limits

A worker that names a model is unchanged, and so is a program worker, which has its own flag. Decision 4 is an instruction: the person can refuse the change, and a project with no `AGENTS.md` gets one only if they allow it.

## Verification

Scenarios M2.4-E244 to E247, written before source.
