# ADR 0091 — fewer waits: approvals the person can remember or deny with a reason, and "Needs you" only when it's true

Status: accepted by the product owner on 2026-10-19 (every recommended option). It amends plan 08 §8.1, §8.2, §8.3,
§8.4, and §8.7, and plan 06 §6.3 (a status item's count in the tab's title).

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase B) measured the owner's chats:

- The model asked for approval 432 times and the person denied one. The median wait was 8 s, the p90 91 s, and the
  turn did nothing meanwhile. The same commands were asked again and again in one chat: `pnpm exec …` 78 times,
  `python3 -` 49 times. Claude Code offers "Yes, and don't ask again" for a command prefix, kept as a project rule.
- 156 edits of ordinary files in the repository were marked risky. The prompt's "rewriting or discarding git history
  or uncommitted work" reads, in a repository with uncommitted changes, as if every edit were risky.
- A denial tells the model only "denied by the user"; Claude Code lets the person say what to do instead.
- A chat that waited only on its helper showed "Needs you" in the list and counted in "Waiting for you", with nothing
  to answer. Twelve chats sat on an unanswered question or approval: nothing told the person.

## Decisions

1. **Approval rules, kept per workspace** (asked; recommended: a workspace setting). The setting
   `kvcoder.approval.allowed` (global and workspace scopes, default `[]`) lists rules, each
   `{ kind: 'line', prefix }` (a prefix of 1 to 200 characters) or `{ kind: 'files' }`. Configuration's Approval row
   lists them, each with Remove.
2. **What a rule allows** (asked; recommended).
   - A `line` rule covers a `shell exec` line, and a binary connector's line `<name> <args>`, when every part of the
     line starts with an allowed prefix followed by nothing or by a space or tab. The parts are what is between
     `&&`, `||`, `;`, `|`, `&`, and line breaks. A line that holds `$(`, a backtick, `<(`, `>(`, `<`, or `>` has no
     parts that a rule can cover, so it asks.
   - A `files` rule covers `fs write`, `edit`, `undo`, and `assemble`.
   - A rule never covers an `mcp` call, a registered command with `asks: true`, or a program worker set to ask.
   - With `kvcoder.approval` `auto`, a call the model marks risky that a rule covers runs without asking; with `ask`,
     every call a rule covers runs without asking (asked; recommended: rules apply with both); `never` needs none.
     The rules are read once per step, like the setting.
3. **Always allow from the card** (asked; recommended: the line's first two words, editable). An approval card of a
   call a rule could cover offers "Always allow" beside Allow: for a line, a field holding the line's first two words
   (the whole line when it has fewer), which the person may change before pressing it; for a file change,
   "Always allow file changes here". It answers `kvcoder.question.answer` with
   `remember: { kind: 'line', prefix } | { kind: 'files' }` and `{ confirmed: true }`: the rule is added to the
   workspace's value of the setting, unless it is there, and the call runs as an allowed one. `remember` with any
   other answer, or on a question that isn't an approval, fails `VALIDATION_FAILED`. A prefix that doesn't cover the
   call is saved as written and the call still runs, since the person allowed it.
4. **Deny with a reason** (asked; recommended). `kvcoder.question.answer` takes `reason` (1 to 1,000 characters) with
   an approval answered `{ confirmed: false }`; the model then reads `denied by the user: <reason>`. The card's
   "Deny…" opens a box for the reason with "Deny"; an empty box denies without one. `reason` with any other answer
   fails `VALIDATION_FAILED`. A retry with the same answer, reason, and rule is acknowledged; with another, it fails
   `VALIDATION_FAILED` as a different answer does (the receipt's fingerprint covers them).
5. **The risky wording** (asked; recommended). The base prompt and `risky`'s description say that creating, editing,
   or rewriting a file inside the workspace folder can always be taken back with `fs undo`, so it is never risky by
   itself, whether or not the repository has uncommitted changes; and that discarding uncommitted work means `git
   reset`, `checkout`, `restore`, `stash drop`, or `clean`.
6. **Who the chat waits on** (asked; recommended: a field, not a status). The session view adds
   `waitingOn: 'person' | 'helpers' | null`: `person` when the session's turn waits on a question or an approval, or
   when one of its helpers, foreground or background, waits on one; `helpers` when its turn waits only on helpers or
   program workers' runs; `null` otherwise. The list shows "Needs you" for `person`, whatever the status, and
   "Working" for `helpers`. `kvcoder.session.count` takes `waitingOn: 'person'`, and the "Waiting for you" status
   item counts with it. `sessions` gains the index `status`.
7. **Telling the person** (asked; recommended: a notification and the tab's title).
   - When a chat starts needing the person while the page is not visible, and the person allowed notifications, the
     page shows the system notification "A chat needs you" with the chat's title; pressing it focuses the page and
     opens the chat. A chat that waits on the person, while the browser hasn't been asked, shows the line "Get a
     notice when a chat needs you while kvman is in the background." with "Turn on", which asks the browser, and
     "Not now", which hides the line in this browser (its `localStorage` key `kvcoder.notify.declined`). Where the
     page has no notifications (the desktop app's engine among them), the line isn't shown.
   - A status item may have `titleCount`, a field of its query's output as `$output` paths are written; kvwebui
     starts the tab's title with `(N) ` when the sum of the items' counts is above 0. kvcoder's "Waiting for you"
     item sets `titleCount: 'count'`.

## Consequences

- A command the person approves once per project, such as the test runner, stops interrupting the work.
- A rule is a person's decision about a prefix, not about a command: `git` allows every git line. The card offers two
  words by default for that reason.
- The session list reads one more indexed query per refresh.
