# ADR 0125 — A background line wakes its chat by default

Status: accepted, 2026-11-09. Asked of the product owner after real chats stopped while a build ran; the recommended
option was chosen. It amends plan 08 §8.1 and §8.3, and ADR 0108, 16.

## Context

ADR 0108, 16 made `notify` opt-in: a background line's end starts a turn only when its call had `notify: true`. In the
owner's two latest chats (2026-11-08 and 2026-11-09, gpt-6.1-terra), the agent started 25 background lines (builds,
`npm test`, Playwright, `apt download`, dev servers) and set `notify` on none, though the field's description said what
it does. It ended turns with "I'll check the output when the build ends" and nothing woke it: the person typed
"Continue." three times, and the last Windows build's result is still unread. The working method's sentence "a run
that ends tells you in a message" also read as if every run wakes the chat.

## Decision

1. **`notify` is true by default** (asked; recommended over waking for every line with no way to keep one quiet, and
   over a prompt-only change). With `background: true`, `shell exec` and a binary's `exec` wake the idle chat when the
   line ends by itself, as `notify: true` did. `notify: false` keeps a line quiet: its end is still a background
   message, and it starts no turn. `notify: true` without `background` still fails `VALIDATION_FAILED`.
2. **The model is told.** `notify`'s description says it is on by default and to set `false` for a server; the shell
   connector's line and the working method say a background line that ends wakes the chat, so the agent may end its
   turn while one runs.
3. **A restart keeps the setting.** `kvcoder.job.restart` starts the line again with the stopped process's `notify`;
   a record saved before this ADR without `notify` restarts quiet.
4. **Unchanged:** the person's Stop, the agent's `background stop`, and kvman stopping start no turn; an end while a
   turn runs is read by its next step; a process record stores `notify: true` only when on.
