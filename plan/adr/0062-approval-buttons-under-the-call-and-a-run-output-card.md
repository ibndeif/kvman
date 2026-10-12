# ADR 0062 — an approval's buttons under its call, and a card of its own for `background output`

Status: accepted by the product owner on 2026-10-12, before source. It amends ADR 0036, decisions 1 to 3 and 12.

## Context

Two things the owner saw in a long chat:

- **Buttons cut to one letter a line.** An approval's Allow and Deny sat on the row of the call's description and line. The conversation column breaks a word anywhere, so beside a long line the two buttons shrank to a letter's width.
- **A run's row shown as raw fields.** `background output` had the fields view, so its card repeated the id twice and showed `kind`, `status`, and `startedAt` as the model gets them.

## Decisions

1. **An approval's buttons are a footer under its call** (the owner's own direction). Each approval shows its description, its closed line, and the view of its payload, then a row with Deny and Allow at its inline end. The buttons of every such row keep their label on one line and never shrink; the row wraps when it is too narrow. "Deny all" and "Allow all" stay in the card's last row.
2. **`background output` has its own view** (asked; chosen over showing the output alone, and over keeping the rows without the repeated id).
   - Closed, its line is `Output`, the id, and the run's status as its outcome, in the words of the Running list: "Running", "Done", "Failed", "Stopped", "Interrupted".
   - Opened, it shows no payload: the id is in the closed line.
   - Then one row: the run's own description (`call`), a chip with the status, with ` · exit {code}` when the exit code isn't 0, and how long the run took when it has ended (`endedAt` less `startedAt`, in the units of ADR 0017, 2). A run that is still running shows no time: the card says what the call read, not what is true now.
   - Then the output: a subagent's answer as Markdown, any other text as an output block (ADR 0036, 7), and a value that isn't text as fields (ADR 0036, 9). A `problem` shows first, in danger color. A run with no output yet shows only its row.
   - A result that has no `call` or `status` keeps the fields view.

## Limits

`background list` and `background stop` keep their views. The status is the one the call read, so an old card of a run that has ended since still says "Running".

## Verification

Scenarios M2.4-E210 to E213, written before source.
