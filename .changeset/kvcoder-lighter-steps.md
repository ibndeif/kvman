---
"@kvman/kvcoder": patch
---

kvcoder (ADR 0108): a ceiling on helpers' thinking (`kvcoder.delegate.thinkingLimit`, high), housekeeping calls (help, tool lookups, background checks, map reads) hidden in the chat, no repeated "finished" message after `background wait`, `notify` on background lines to wake the chat, rule files read from folders one level down and kept for the chat, a check-in every 60 steps, payload signatures for registered connectors and the command's help in payload errors, `run` with a `calls` list, and a url artifact that replaces an ended one at the limit.

Every delegation now runs in the background (ADR 0108, 1 and 2): `delegate run` takes a structured brief (`kind` find, change, check, or review; `goal`; `done`; `files` for a change run; `context` line ranges; `budget`), returns `started <id>` at once, and its answer arrives as a message that wakes the chat. find and review runs only read, a check run changes no file, and a change run changes only its files. A helper's turn ends at its budget, Stop leaves helpers running, and the helper card shows its headline, its step of its budget, its time, and its last call. The history is trimmed once past 60K tokens, a step waits for a lost connection instead of failing, and an MCP server over HTTP or with a port is kept for the turn.
