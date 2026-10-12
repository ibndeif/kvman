# ADR 0051 — plain command output, the compaction instruction, the artifact limit's text, and long helper titles

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-41, 42, 45, and 47.

## Decisions

1. **Plain output (KVC-42).** A shell call and a background process run with `NO_COLOR=1`, unless kvman's own environment already sets `NO_COLOR` or `FORCE_COLOR`; a command line that sets either itself still wins. Terminal colour and cursor codes (ANSI CSI, OSC, and two-character escapes) are removed from a shell call's output and from a background process's reported lines before they are stored or sent to the model. No setting.
2. **The compaction instruction (KVC-41).** The instruction says that it is kvman's, not the person's, and that it must not appear in the summary as a request or a direction. It stays the last message of the summarizing call.
3. **The artifact limit (KVC-45).** A chat that already holds 20 artifacts still fails `TOO_LARGE`; its message says so and what to do: update one that exists, listed with `artifact list`, or delete one. No new code, and the limit stays 20.
4. **Long helper titles (KVC-47).** `delegate run` takes a `title` of 1 to 200 characters. A title over 60 names the child session by its first 59 characters and `…`; a program worker's run stores no title. One over 200 fails validation as before.

## Verification

Scenarios M2.4-E152 to E155, written before source.
