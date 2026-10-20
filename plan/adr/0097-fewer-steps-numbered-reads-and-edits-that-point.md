# ADR 0097 — fewer steps, numbered reads, and edits that point

Status: accepted by the product owner on 2026-10-20 ("fix them all", then the recommended option of each of the four
questions asked). It amends plan 08 §8.1, §8.2, §8.3, and §8.5, and ADR 0034, 4 for `fs read` and `fs edit`.

## Context

A review of kvcoder's prompts and harness on 2026-10-20 measured the owner's database (gpt-6.1-sol; 128 turns and
3,685 model calls since 2026-10-13, 783 replies with calls since ADR 0089 reached the installed kvman):

- 89% of replies with calls hold one call, and 5% say anything (about 7% before ADR 0089). The request allows
  parallel calls, so this is the model's choice. Each step sends the whole context again: 68K tokens at the median,
  142K at p90, and a median turn takes 13 steps.
- `fs read` returns `{"content": "…"}`: the model reads a file as escaped JSON with no line numbers. 35% of reads
  read a file the chat had already read, mostly another range of it (484 of 715).
- Most failed edits are "found N times" (8 of 11 since 2026-10-19; 46 of 67 in all), and the error says nothing
  about where.
- Call arguments are 23% of what is sent; ADR 0094, 1 clears old results only, so the content of every old write
  stays.
- The map's three paragraphs (Plan, Confirm, Execute) are 37% of the lead's method, though 5 maps were set since
  2026-10-19, and the `execution-map` entry repeats most of them.
- The lost-reply and incomplete-reply hints say "one file per reply" and "one tool call per reply", and they stay in
  the history; "Decide for me" removes `ask`, but the method still tells the lead to call it; the `execution-map`
  entry says a step's note holds 500 characters, where `update` takes 300.

## Decision

1. **Fewer steps.** The rule that independent calls go in one reply moves to the start of both methods, right after
   their first line, and says why (each reply is a step that sends the whole conversation again); the lead's
   talk-as-you-work rule follows it, with one example of a good reply. The `run` tool's description adds that
   independent calls go in one reply as several `run` calls. **`fs read-files`** (asked; recommended over `paths` on
   `fs read`, and over prompt changes alone): `{ files: [{ path, fromLine?, lines? }] }`, 1 to 10 files, read in
   order, each as `fs read` reads it, sharing one call's 30 KB: a file the rest of the budget can't hold reads as
   much as fits and says where to read on, and a file after the budget is used says it wasn't read. A file that
   can't be read (missing, a folder, not UTF-8, outside the workspace) says its error in its own place and the others
   are still read. Each file it read counts as read for a change (ADR 0053), and a file whose lines the chat
   already holds says so as `fs read` does (ADR 0034, 2). It never asks, and a read-only helper may run it.
2. **Numbered reads** (asked; recommended over `N→` lines). `fs read` and each file of `fs read-files` read to the
   model as a header line, then each line as its number, right-aligned to six places, a tab, and its text, as
   `cat -n` prints it: `<path> · lines <from>–<to> of <total>`, then ` · read on with fromLine <n>` (and
   `, fromColumn <c>`) when something was left out. The call's `details` keep the JSON, so the call card is
   unchanged. `fs edit`'s result reads the same way: `<path> · <n> replacements · lines <a>–<b> now read:` and the
   numbered lines, the marker of a long change kept as its own unnumbered line; its JSON gains `skipped?
   { afterLine, lines }` for that marker. The `fs` entry says the number and the tab aren't part of the file.
3. **Edits that point** (asked; recommended over the first line alone, and over nothing more). "found N times" names
   the line of each match, the first 20, and shows the first 5 with the line before and after. A text not found is
   looked for again with every run of whitespace taken as one space (indentation, line ends, trailing spaces); when
   it is found that way, the error says so and shows those lines of the file. Otherwise it shows up to 3 places where
   the first non-empty line of `oldText`, trimmed, appears, each from the line before it to as many lines as `oldText`
   has. Shown lines are numbered as a read numbers them, at most 20 a place and 200 characters a line, places whose
   lines overlap are shown once together, and they follow the error's first line, which still ends with `Nothing was
   written.` (ADR 0035, 3). Nothing is ever applied this way. The same holds for `artifact edit`, which shares the matching.
4. **Old call text cleared** (asked; recommended over named fields). A call whose result is sent cleared (ADR 0094, 1)
   is sent with every string of its payload longer than 500 characters replaced by `[cleared to save memory: <n>
   characters]`; the stored call and the conversation don't change, and both change at the same moment, so the
   provider's cache is broken no more often than before.
5. **A shorter method.** The lead's Plan and Execute become short: when a map is needed, that the `execution-map`
   entry says how to keep one, who does each step, and the smallest change checked. The map's own rules (steps,
   `uses`, branches, details, marking steps, setting it again) move into the `execution-map` entry, which no longer
   repeats them twice. Confirm the plan stays in the method.
6. **Hints for that piece only.** The lost-reply hint says to write *that* file in parts with `fs part` and
   `fs assemble`; the incomplete-reply hint drops "one tool call per reply".
7. **"Decide for me" without `ask`.** With `decides`, the lead's Clarify decides what only the person would have
   decided and says the choice, Confirm the plan says what the lead understood and starts, the `ask` rule is left
   out, and the general method decides instead of asking.
8. **True limits.** The `execution-map` entry gives each limit as the schema has it, `uses` and the step's note
   included.
9. **Not now: one tool per command.** Native tools would add the provider's own schema checks, but payload errors are
   about 1% and ADR 0011 stays; revisit it if a Claude model batches where gpt-6.1-sol doesn't.

## Consequences

- A model that batches reads takes fewer steps; one that doesn't still reads several files in one call.
- An old chat's stored results stay JSON, and the model is sent them as they were; a read stored then still counts
  as held, read from its text, since its details kept no copy.
- A read's and an edit's stored result keeps the JSON in its `details` beside the numbered text, since the two now
  differ (ADR 0034, 7), so these results take about twice the room in the database.
- The `kvcoder.prompt` benchmark measures a prompt of a different size.
