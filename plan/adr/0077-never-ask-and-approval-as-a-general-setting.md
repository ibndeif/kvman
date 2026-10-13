# ADR 0077 — a third approval mode, `never`, and approval as a general kvcoder setting

Status: accepted by the product owner by choice on 2026-10-13, before source. It amends ADR 0009 (161), ADR 0011 (7), ADR 0014 and ADR 0020 (2 and 13: where the setting is shown), ADR 0021 (12 and 39), ADR 0022 (5), and plan 08 §8.3, §8.4, §8.5, and §8.7.

## Context

The owner wrote: "we currently have two modes for permissions 'ask for risky', 'always ask' and we need to add a new one for always don't ask", and then: "it is better to move this setting from shell to general kvcoder settings".

The setting was `kvcoder.shell.approval`, `auto` or `ask`, shown in the `shell` connector's dialog. It covered `shell exec`, a binary's `exec`, `fs write`, `fs edit`, and `mcp call`. Two more things asked whatever it said: a registered command whose entry has `asks: true` (ADR 0022, 5), and a program worker with `approval: 'ask'` (ADR 0021, 12).

## Decisions

1. **The value is `never`** (asked; chosen over `off` and `allow`). The setting is `auto` (the default), `ask`, or `never`, named "Ask only for risky calls", "Ask for every call", and "Never ask".
2. **With `never` no call asks the person** (asked; chosen over only the calls the setting covered, and over those plus `asks: true` commands). `shell exec`, a binary's `exec`, `fs write`, `fs edit`, and `mcp call` run at once whatever `risky` says; a registered command with `asks: true` runs at once; and a program worker with `approval: 'ask'` starts at once. A helper's calls follow the same setting.
3. **What `never` leaves as it is.** `risky` is still required, and a call that leaves it out still fails `VALIDATION_FAILED`. The agent's own questions (`ask text`, `choice`, `confirm`, and with them the plan's confirmation) still wait: they are conversation, not permission. Every refusal stays: a read-only helper's, a helper's artifact and question, the staging guard, and a payload that is not valid. The entry rule of ADR 0021, 39 stays as it is: it is about a worker's own entry. With `never`, a worker set to ask before a run and to approve its own actions does start unasked; the person chose that when they confirmed `never`. The trust prompt and the listener's checks are not calls and are untouched.
4. **Choosing `never` is confirmed** (asked; chosen over a warning line, and over no guard). In kvcoder's configuration, choosing "Never ask" saves nothing and opens a confirmation under the control, `role="alertdialog"`, with the focus on "Cancel": the title "Never ask before a call?", the text "The agent will run commands, change files, change kvman itself, and start worker programs without asking you. What it reads can steer it.", and the buttons "Cancel" and "Turn off asking". Only "Turn off asking" saves `never`, into the scope the page is set to; "Cancel" and Escape close it and the control shows the stored choice again. The text differs from the one shown when asked ("in this workspace") because the choice may be for all workspaces and decision 2 widened what it covers.
5. **The approval note says so.** Under `never` the note on the Chat page and under the control reads: "Never-ask mode requests no approval. Shell or binary execution, file writes or edits, MCP tool calls, registered commands marked as needing approval, and worker programs set to ask all run at once. The agent's own questions to you still wait for your answer." The line that approval is not sandboxing stays.
6. **The setting is general, and its key is `kvcoder.approval`** (asked; chosen over keeping the key and moving only the control, and over carrying saved values over). It is the third row of the Agent card of kvcoder's configuration, after the two model rows: the custom component `kvcoder.approval {}`, titled "Approval". The `shell` connector's dialog keeps one row, the shell program. Nothing is carried over: a value saved under `kvcoder.shell.approval` is no longer read, so a person who had chosen `ask` is back on `auto` until they choose again, and a preset that names the old key stops kvman with `VALIDATION_FAILED` (plan 02 §2.8) until it is edited.
7. **The mode is read once per step.** A change takes effect from the next step; an approval that was already waiting when the mode became `never` stays until it is answered.

## Limits

- The confirmation is the configuration page's. `kernel.settings.set`, a preset, and the agent's own `kvman settings-set` can set `never` without it. `settings-set` is an `asks: true` command, so the person is asked about that call unless the mode is already `never`; a preset is its author's, and an unbundled one needs the person's trust at start.
- A command's `help` still says "The person is asked before this runs." under `never`.
- Approval was never a sandbox, and `never` removes the last stop before a call: what the model reads (a file, a page, a tool's result) can steer what it runs.

## Verification

Scenarios M2.4-E289 to E300, written before the tests. The scenarios of QA28 that were about the approval row in the `shell` dialog are now about the row on the page (`extensions/kvcoder/test/web/approval-setting.test.ts`), and QA28-H8 saves the shell program.
