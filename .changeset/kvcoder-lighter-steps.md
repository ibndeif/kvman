---
"@kvman/kvcoder": patch
---

kvcoder (ADR 0108): a ceiling on helpers' thinking (`kvcoder.delegate.thinkingLimit`, high), housekeeping calls (help, tool lookups, background checks, map reads) hidden in the chat, no repeated "finished" message after `background wait`, `notify` on background lines to wake the chat, rule files read from folders one level down and kept for the chat, a check-in every 60 steps, payload signatures for registered connectors and the command's help in payload errors, `run` with a `calls` list, and a url artifact that replaces an ended one at the limit.
