# QA 59 — Fewer waits: approvals remembered or denied with a reason, and "Needs you" only when it's true (ADR 0091)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase B) found 432 approvals
asked and one denied, the same command prefixes asked dozens of times in one chat, ordinary edits marked risky, a
denial that tells the model nothing, and "Needs you" shown for a chat that waited only on its helper.

**The owner chose** every recommended option: rules in a workspace setting; a rule covers a line whose every part
starts with an allowed prefix, or file changes; the card offers the line's first two words, editable; rules apply with
`auto` and `ask`; `reason` on a denial; the clearer risky wording; `waitingOn` on the session view; a notification and
a count in the tab's title.

Paths are relative to the repository root.

## Happy path

- **QA59-H1 a rule lets a covered line run without asking.** *Given* `kvcoder.approval.allowed` holds
  `{ kind: 'line', prefix: 'pnpm exec' }`, *when* the model sends `shell exec { line: 'pnpm exec vitest run',
  risky: true }`, *then* it runs at once and no approval is asked. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-H2 a files rule lets file changes run without asking.** *Given* a `files` rule, *then* a risky `fs write` and
  `fs edit` run at once. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-H3 rules apply with `ask` too.** *Given* `kvcoder.approval` `ask` and a `pnpm exec` rule, *then* a
  `pnpm exec` line marked not risky runs at once and an `ls` line asks. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-H4 Always allow saves the rule and runs the call.** *Given* an approval of `pnpm exec tsc`, *when* the person
  answers `{ confirmed: true }` with `remember: { kind: 'line', prefix: 'pnpm exec' }`, *then* the call runs, the
  workspace's `kvcoder.approval.allowed` holds the rule once, and the next `pnpm exec eslint .` runs without asking.
  `extensions/kvcoder/test/approval-remember.test.ts`
- **QA59-H5 a denial carries its reason.** *When* the person denies with `reason: 'use pnpm test instead'`, *then* the
  model reads `denied by the user: use pnpm test instead`. `extensions/kvcoder/test/approval-remember.test.ts`
- **QA59-H6 the card offers Always allow and Deny with a reason.** *Given* an approval of `pnpm exec vitest run`,
  *then* the card shows a field holding `pnpm exec` and "Always allow"; pressing it answers with that prefix (or the
  one the person typed); Deny still denies at once, and "Deny and say why…" opens a box whose "Deny" sends what was
  typed as `reason`, or no `reason` when empty;
  a file change offers "Always allow file changes here". `extensions/kvcoder/test/web/approval-always.test.ts`
- **QA59-H7 Configuration lists the rules and removes one.** *Given* two rules, *then* the Approval row lists
  `Always allowed: pnpm exec` and "Always allowed: file changes", and Remove writes the list without that rule.
  `extensions/kvcoder/test/web/approval-setting.test.ts`
- **QA59-H8 the prompt says an edit isn't risky by itself.** *Then* the base prompt and `risky`'s description say
  that a change to a file inside the workspace folder can always be taken back with `fs undo`, whether or not there
  are uncommitted changes, and name `git reset`, `checkout`, `restore`, `stash drop`, and `clean` as discarding
  uncommitted work. `extensions/kvcoder/test/unit/prompt-build.test.ts`
- **QA59-H9 `waitingOn` says who the chat waits on.** *Then* a chat waiting on an approval is `person`, one waiting
  only on a foreground helper is `helpers`, one whose foreground helper waits on an approval is `person`, an idle chat
  whose background helper waits on a question is `person`, and an idle chat with none is `null`.
  `extensions/kvcoder/test/waiting-on.test.ts`
- **QA59-H10 the count is of chats waiting on the person.** *Given* those chats, *then*
  `kvcoder.session.count { waitingOn: 'person' }` counts the three that are `person`, and the status item asks it so.
  `extensions/kvcoder/test/waiting-on.test.ts`
- **QA59-H11 the list says "Needs you" only for the person.** *Given* sessions with `waitingOn` `person`, `helpers`,
  and a running one, *then* the list shows "Needs you", "Working", and the running mark.
  `extensions/kvcoder/test/web/sessions.test.ts`
- **QA59-H12 a notification when a chat starts needing the person.** *Given* notifications allowed and the page
  hidden, *when* the list's next read finds a chat newly `person`, *then* one notification "A chat needs you" with the
  chat's title is shown, and pressing it opens the chat. `extensions/kvcoder/test/web/notify.test.ts`
- **QA59-H13 the one-time line asks the browser.** *Given* a chat that waits on the person and a browser not yet asked,
  *then* the line shows; "Turn on" asks for permission; "Not now" hides it and it stays hidden.
  `extensions/kvcoder/test/web/notify.test.ts`
- **QA59-H14 the tab's title carries the count.** *Given* a status item with `titleCount: 'count'` whose query returns
  `{ count: 2 }`, *then* the title starts with `(2) `; with 0 it doesn't. `extensions/kvwebui/test/web/title-count.test.ts`

## Edge cases

- **QA59-E1 a chained line asks unless every part is covered.** *Given* a `pnpm exec` rule, *then*
  `pnpm exec a && rm -rf b`, `pnpm exec a | sh`, and `pnpm exec a & curl x` ask, while
  `pnpm exec a && pnpm exec b` runs. `extensions/kvcoder/test/unit/approval-rules.test.ts`
- **QA59-E2 a part with more than plain words always asks.** *Then* lines holding `$(`, `$`, a backtick, `<(`, `<`,
  `>`, `\`, PowerShell's `(…)` and `@(…)`, braces, or brackets are never covered, whatever the rules, and a line of
  plain words, globs, and quotes is. `extensions/kvcoder/test/unit/approval-rules.test.ts`
- **QA59-E3 a prefix matches at a word's end only.** *Then* a `git status` rule covers `git status` and
  `git status --short`, not `git statuses` or `git stash`. `extensions/kvcoder/test/unit/approval-rules.test.ts`
- **QA59-E4 a binary's line is matched as `<name> <args>`.** *Given* a `gh pr` rule, *then* `gh exec { args: 'pr list' }`
  runs without asking and `gh exec { args: 'repo delete x' }` asks. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-E5 rules don't cover the rest.** *Given* `line` and `files` rules, *then* a risky `mcp call`, a command with
  `asks: true`, and a program worker set to ask still ask. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-E6 a rule's change counts from the next step.** *Given* a rule added while a step runs, *then* that step's
  calls still ask, and the next step's don't. `extensions/kvcoder/test/approval-rules.test.ts`
- **QA59-E7 `remember` and `reason` only where they belong.** *Then* `remember` with a denial or on a text question,
  `reason` with an allowed call, and an empty or 1,001-character reason fail `VALIDATION_FAILED`, and nothing is saved.
  `extensions/kvcoder/test/approval-remember.test.ts`
- **QA59-E8 a rule already there is not added again.** *Given* the rule exists, *when* Always allow sends it again,
  *then* the list holds it once. `extensions/kvcoder/test/approval-remember.test.ts`
- **QA59-E9 a retry is acknowledged only with the same reason and rule.** *Then* the same answer with the same reason
  is acknowledged, and with another reason fails `VALIDATION_FAILED`. `extensions/kvcoder/test/approval-remember.test.ts`
- **QA59-E10 no notification in the wrong moments.** *Then* none is shown while the page is visible, without
  permission, for a chat already `person` at the previous read, or where the page has no notifications (no line
  either). `extensions/kvcoder/test/web/notify.test.ts`
- **QA59-E12 a files rule leaves code and secrets to the person.** *Then* `.git/…` (also through a symlink), `.env`,
  `.env.local`, and the top `AGENTS.md` or `CLAUDE.md` still ask, while `docs/AGENTS.md` and `src/app.ts` don't.
  `extensions/kvcoder/test/unit/approval-rules.test.ts`
- **QA59-E11 an old receipt still acknowledges.** *Given* a receipt written before this ADR (its fingerprint over the
  answer alone), *then* a retry with the same answer and no reason is acknowledged.
  `extensions/kvcoder/test/approval-remember.test.ts`
