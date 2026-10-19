# kvcoder review 2026-10-19 — implementation plan

The review measured kvcoder against Claude Code from the owner's own chats (`~/.kvman/kvman.db`, read only:
103 chats in 41 workspaces, 6,365 model calls, 440 turns, Oct 1–19, mostly GPT models) and from the UI on a copy of
that home. It found 20 things worth doing. This file is the plan to implement all of them, and the ledger of their
status. The owner accepted every recommended option on 2026-10-19 ("all recommended").

## How the work runs

Every phase follows CLAUDE.md §1–2, as the KVC campaign did:

1. The owner answers the phase's decisions (each has real alternatives, the recommended one first).
2. One ADR per phase records the answers, and the plan text (`plan/08`, and `plan/07` or `plan/06` where named) is
   corrected before any code.
3. The phase's scenarios are written in `milestones/QA<n>-TEST-CASES.md`: one happy-path scenario per item, and every
   limit, failure, and race it names.
4. Code, then one test per scenario, named with its id.
5. Related tests per item; at the end of the phase the full gates once, capped
   (`systemd-run --user --scope -q -p MemoryMax=18G … --maxWorkers=6`, after checking `free -m`, `uptime`, and that no
   other session edits the tree): `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`.
6. A changeset for each changed extension (`@kvman/kvcoder`, `@kvman/kvai`, `@kvman/kvwebui`), the root `README.md`,
   the extension docs, then one commit per item on main. No push, no release unless asked.

| Phase | Items | ADR | Scenarios | Why this order |
|---|---|---|---|---|
| A. Quick wins | 4, 2, 3, 7, 18, 20 | 0090 | QA58 | Small, independent, each removes failed or wasted steps at once |
| B. Fewer waits | 9, 16, 15 | 0091 | QA59 | Approvals and unseen questions are where the person's time goes |
| C. Less pushing | 10, 11, 12 | 0092 | QA60 | Removes "continue" messages and unwanted questions |
| D. A chat you can read and review | 14, 17, 19 | 0093 | QA61 | The largest UI change; best after B and C change what a turn holds |
| E. Context and robustness | 1, 6, 5, 8, 13 | 0094 | QA62 | Each needs a measurement or a dependency answer first |

## The decisions

Answer once per phase; "all recommended" is a valid answer. Each decision says what it changes.

### Phase A

- **A1 — `replaceAll` (item 4).** (a) *Recommended:* an optional `replaceAll: true` on each edit of `fs edit` and of
  `artifact edit`; every occurrence is replaced, overlap rules unchanged, `replacements` counts them all. (b) `fs edit`
  only.
- **A2 — `fs find` (item 2).** Payload `{ pattern, path? }`, the same glob syntax as `fs search`'s `glob`, the same
  skips (`node_modules`, dot folders, what Git ignores). Order: (a) *Recommended:* newest modified first, as Claude
  Code's Glob; (b) path order. Limit: (a) *Recommended:* 200 paths with `truncated`; (b) 1,000 as `fs list`.
- **A3 — `fs search` (item 3).** (a) *Recommended:* add `context?` (0–10 lines before and after each match, merged
  when they touch) and `filesOnly?` (paths and match counts only); the default output stays as it is. (b) Make
  `filesOnly` the default, as Claude Code's Grep (fewer tokens, but one more call to see a line).
- **A4 — limits the model can't foresee (item 7).** (a) *Recommended:* numbers with a maximum are cut to it, as
  `shell exec`'s `timeoutMs` already is (`background wait`'s `timeoutMs` first); a string limit is shown in the
  signature, as `goal (≤300)`, which amends ADR 0012, 3. (b) Only raise the `execution-map` text limits.
- **A5 — failure messages (item 18).** `kvai/USAGE_LIMIT` already has a plain sentence; the raw text seen in the
  UI came from older `PROVIDER_ERROR` failures. (a) *Recommended:* for `USAGE_LIMIT`, `KEY_MISSING`, and
  `RATE_LIMITED` after its retries, "Choose another model" comes first and Retry second; a reset time is shown only
  when the provider gives one (verify whether pi-ai exposes it). (b) Wording only.
- **A6 — polish (item 20).** Durations over an hour read "21 h 34 min"; counts use the catalog's plural forms
  (`en` and `ar`; confirm kvwebui's `t` supports them, else a neutral phrasing such as "Replaced: 1"); Esc in the send
  box stops a running turn when the box is empty and no menu or list is open; Up in an empty send box recalls the
  person's last message of this chat. (a) *Recommended:* all four. (b) Bugs only (the first two).

### Phase B

- **B1 — where approval rules live (item 9).** (a) *Recommended:* a workspace setting `kvcoder.approval.allowed`, a
  list of rules shown and removable in Configuration's Approval row. (b) Rules for this chat only. (c) Both.
- **B2 — what a rule matches.** (a) *Recommended:* a `shell exec` or binary `exec` line whose every part (split on
  `&&`, `||`, `;`, `|`, and new lines) starts with an allowed prefix at a word boundary; a part with `$(`, a backtick,
  or a redirection never matches, so it asks; plus one rule kind "file changes in this workspace" for `fs write`,
  `edit`, `undo`, and `assemble`. A registered command with `asks: true` and a program worker set to ask are never
  covered. (b) Shell prefixes only.
- **B3 — the offered prefix.** (a) *Recommended:* the line's first two words (`pnpm exec`), editable in the card
  before it is saved. (b) The first word only. (c) The whole line.
- **B4 — rules and the `ask` mode.** (a) *Recommended:* rules apply with `auto` and `ask` (they are the person's own
  choice); `never` needs none. (b) `auto` only.
- **B5 — deny with a reason (item 16).** (a) *Recommended:* `kvcoder.question.answer` takes an optional `reason`
  (1–1,000 characters) with a denial; the model reads `denied by the user: <reason>`. This adds a field to a public
  input. (b) No reason field; the person writes a message instead.
- **B6 — the risky wording (item 9).** (a) *Recommended:* the base prompt says that editing a file inside the
  workspace can always be taken back with `fs undo`, so it is never risky by itself, and that "discarding uncommitted
  work" means `git reset`, `checkout`, `restore`, and `clean`. (b) Leave the prompt.
- **B7 — "Needs you" (item 15).** Today `waiting` covers a person's question and a helper's run. (a)
  *Recommended:* the session view adds `waitingOn: 'person' | 'helpers' | null` (from the turn's pending calls and
  the chat's waiting background helpers); the list shows "Needs you" only for `person`, "Working" for `helpers`; the
  status item counts `person` only. A public DTO gains a field; `status` is unchanged. (b) A new status
  `waiting-helpers` (changes a public enum).
- **B8 — telling the person (item 15).** (a) *Recommended:* a browser notification when a chat starts needing the
  person and the page isn't visible, after the person allowed notifications from a one-time prompt in the
  conversation; the tab title starts with `(N)`. The title belongs to kvwebui, so it gains a way for an extension's
  status item to add a count (plan 06). The desktop app is checked; if its engine has no notifications, that is a
  separate desktop item. (b) Tab title only. (c) Notifications only.

### Phase C

- **C1 — long tasks that stop short (item 10).** (a) *Recommended:* a prompt rule for both methods ("when the person
  asked for several items or a map has ready steps, keep working until all are done or you are blocked; report once at
  the end, not after each batch") and a "Continue" button on the "N steps of the execution map are not done" line,
  which sends "Continue." as the person's message. (b) Also an opt-in per chat, "Keep going until the map is done",
  where kvman starts the next turn itself when a turn ends `done` with ready steps and nothing waits on the person, at
  most 5 times in a row and never when no step changed since the last one; this amends ADR 0064, 11 ("kvman starts
  nothing itself"). (c) Prompt rule only.
- **C2 — "Decide for me" (item 11).** (a) *Recommended:* a per-chat switch in the send box, kept on the session
  (`decides`, set with `kvcoder.session.configure`): while on, the chat has no `ask` connector and the lead's prompt
  says the person asked it to make each choice itself, the recommended one, and to say what it chose in one line.
  Approvals are unaffected. Default off. (b) kvman answers each `ask choice` with its first option automatically and
  shows it as an answered card. (c) A global setting instead of a per-chat switch.
- **C3 — the person's preferences (item 12).** (a) *Recommended:* a setting `kvcoder.preferences`, text up to 16 KB,
  in the global and workspace scopes, sent as the prompt section "The person's preferences" after the base prompt and
  before the project's rules; edited in Configuration's Agent card; a "Remember this" action on the person's message
  appends its text after a confirmation. Only the person writes it; the agent can't. (b) Global scope only. (c) No
  "Remember this" action.

### Phase D

- **D1 — a turn as a story (item 14).** (a) *Recommended:* a closed call card is one line; the calls between two
  pieces of the agent's text fold into one row ("Read 6 files · edited 2 · ran 3 commands · 1 failed", the time);
  a fold holding the running call, a failure, a question, or an approval is open; edit and write cards start closed
  (amends ADR 0036, 5); a turn's final answer has its own style. (b) The same without folding.
- **D2 — the Changes view (item 17).** What it lists: (a) *Recommended:* in a Git workspace, the files this chat
  changed (a new workspace collection `file-changes { sessionId, path, firstAt }`, written by each `fs` change),
  each with its `git diff` against `HEAD` and +/− counts; without Git, the same list with the change from the chat's
  oldest kept backup. (b) Everything `git status` shows, whoever changed it. Actions: (a) *Recommended:* Undo per file
  (the existing `fs undo` rule, run as the person) and "Commit", which sends "Commit these changes." as the person's
  message, so the agent writes the message and the commit is approved as usual. (b) Undo only.
- **D3 — narrow widths (item 19).** (a) *Recommended:* below 60 rem of page width the chat list is a drawer opened
  from the header; the send box never covers the messages; the model and thinking pickers shrink to icons below
  30 rem. (b) Fix the overlap and the empty picker only.

### Phase E

- **E1 — clearing old tool results (item 1).** (a) *Recommended:* the session keeps `clearedThroughSeq`; tool
  results at or before it are sent as `[cleared to save memory: <the call's card line>. Make the call again if you
  need it.]`. It moves forward only (i) at a turn's first step when the chat's last model call is over an hour old
  (the provider's cache has expired), or (ii) when the clearable text is over 20,000 tokens and the prompt is over
  half the window; the newest 40,000 tokens of tool results are never cleared (opencode's numbers). Stored messages
  and the UI don't change; the "unchanged since you read it" answer ignores cleared results. (b) Only (i).
  (c) Only (ii).
- **E2 — the stalled stream (item 6).** First, kvai logs each call's longest gap between stream events (a number,
  no payload) for a week of real use. Then (a) *Recommended:* no event for N seconds after the first one, or for M
  before it, aborts the call as a temporary `kvai/PROVIDER_ERROR` (`reason: stream stalled`), so the step's retries
  take over; N and M are set from the measurement. (b) Make kvcoder retry `TIMEOUT` only.
- **E3 — the check after edits (item 5).** (a) *Recommended:* a workspace setting `kvcoder.check`
  (`{ line, timeoutMs }` or `null`, the default); after a reply whose `fs` changes succeeded it runs once, without
  asking (the person configured it), and its exit code and last 4 KB end the last change's result, as the map
  reminder does. (b) Read a "check" line from the `AGENTS.md` Commands section instead. (c) Lead only, not helpers.
- **E4 — a fallback model (item 8).** (a) *Recommended:* a setting `kvcoder.fallbackModel` (default `null`, off);
  when a step fails `kvai/USAGE_LIMIT`, or `RATE_LIMITED` after all retries, the chat switches to it, a notice says so,
  and the step runs once more. (b) No setting: rely on A5's "Choose another model".
- **E5 — the web connector (item 13).** It needs a dependency to turn HTML into text, a question in itself.
  (a) *Recommended:* `web fetch { url }`, http and https only, no private or loopback addresses, its text cut as a
  connector result is; the first fetch from each domain in a chat asks as a risky call does. (b) Never asks.
  (c) Don't add it; MCP servers cover the web.

## The items

Each item: what changes, where, its scenarios, and how we'll know it worked. "→" names the plan text it amends.

### Phase A — quick wins

**4. `fs edit` `replaceAll`** → plan 08 §8.5 (fs table, Matching; artifact Edits).
`src/files/edit-text.ts` (`locate` collects every occurrence when asked), the payload schema in
`src/connectors/fs.ts` and `artifact.ts`, the signatures, the call card's edit view (`web/src/edit-diff.ts`).
Scenarios: replaces three occurrences; `replaceAll` with an overlap still refused; with zero matches still refused;
the result's `replacements` and changed lines. Worked when: "found N times" failures drop near zero.

**2. `fs find`** → §8.3 table, §8.5 fs table, the index signature, the read-only and helper lists.
A new `kvcoder.fs.path.find` query beside `src/files/search-text.ts` (reusing its walk, its Git-ignore check, and its
glob), the connector entry, the call card's line `Find <pattern> 14 files` and view. Scenarios: glob across folders;
skips; Git-ignored; truncation; a path outside the folder; read-only helper allowed. Worked when: chains of `fs list`
replies drop.

**3. `fs search` `context` and `filesOnly`** → §8.5 (fs table, Searching). `src/files/search-text.ts`, the schema, the
card. Scenarios: context merged across touching matches; at the start and end of a file; `filesOnly` counts; both
together refused or defined (decide in scenarios). Worked when: share of whole-file reads after a search falls.

**7. Limits** → §8.3 (Signatures), §8.5. `src/connectors/payload-fields.ts` (signatures), `background.ts`
(`timeoutMs` cut), `execution-map.ts` schema. Scenarios: an over-limit `timeoutMs` cut and run; a signature shows
`(≤N)`; the index snapshot for `kvcoder.prompt` updates (the bench baseline moves; re-record only that number).

**18. Failure actions** → §8.7 (the two actions under a failed turn). `web/src/RecoveryActions.vue`, kvai's failure
mapping (verify the reset time). Scenarios: order of the two actions per code; the sentence per code; no raw provider
text for the mapped codes.

**20. Polish** → §8.7. `web/src/durations.ts` and the header's `totals`, the catalog plurals (`locales/en.json`,
`ar.json`), `MessageComposer.vue` (Esc, Up). Scenarios: 75 min, 25 h; plural forms in `ar`; Esc with a menu open
closes the menu only; Up with text in the box does nothing.

### Phase B — fewer waits

**9 + 16. Approval rules and the approval card** → §8.3 (Approval), §8.7 (approval card, Configuration's Approval
row), §8.2 (risky wording, B6), plan 08 §8.1 (`question.answer`'s `reason`, B5).
Backend: the setting and its schema in `src/register-settings.ts`; matching in a new `src/turns/approval-rules.ts`
(the line splitter has an explicit test per shell syntax; PowerShell's separators `;` and new lines on Windows);
`evaluateCurrentCall` in `src/turns/run-calls.ts` checks the rules before it returns an approval question; the
answer path (`src/turns/apply-answer.ts`) stores a rule when the person chose "Always allow" and carries `reason`.
UI: `ApprovalsCard.vue` gets "Always allow `<prefix>` here" with the editable prefix, and "Deny…" with the reason box;
`ApprovalSetting.vue` lists and removes rules. Scenarios: a matching line runs without asking; `pnpm exec a && rm x`
asks; `$(…)` asks; a rule saved from one call lets the next run at once; with `ask` mode; a `asks: true` command still
asks; the reason reaches the model; Windows splitting. Worked when: asks per chat fall; the share of edits marked
risky falls.

**15. "Needs you" and notifications** → §8.1 (session view), §8.7 (session list, status items), plan 06 (a title
count from a status item, B8).
`src/sessions/session-view.ts` derives `waitingOn`; `kvcoder.session.count` counts it; `SessionList.vue`; a small
notifier in the conversation bridge (permission prompt once, `document.visibilityState`); kvwebui's title.
Scenarios: waiting on a helper shows "Working" and isn't counted; a background helper's approval counts; notification
only when hidden and allowed; the title count follows. Worked when: chats left waiting on the person fall.

### Phase C — less pushing

**10. Keep going** → §8.2 (both methods' rules), §8.7 (the map line's button), and with C1 (b) §8.5 and ADR 0064, 11.
`src/prompt/working-method.ts`; `ConversationView.vue` (the line and its button); with (b), the session flag and a
check in `src/turns/end-turn-state.ts` that queues the next turn after the commit, with its counter. Scenarios: the
button sends "Continue."; with (b), five automatic turns at most, none when nothing changed, none while anything waits
on the person, a Stop ends the chain. Worked when: "continue" messages per chat fall.

**11. Decide for me** → §8.1 (session `decides`), §8.2, §8.5 (`ask` absent), §8.7 (the switch).
`src/sessions` (configure, view), `src/prompt/session-grants.ts` (no `ask` while on), `working-method.ts`, a switch in
`ModelControls.vue`. Scenarios: on, `ask` isn't in the index and a call to it is refused as an unknown connector;
off again restores it from the next step; approvals still ask; a helper is unaffected (it never has `ask`).

**12. The person's preferences** → §8.2 (the section's place), §8.7 (Configuration, "Remember this").
`src/prompt/session-prompt.ts` (the section, counted in the 64 KB of sections), the setting, `MessageItem.vue`'s
action, the Agent card. Scenarios: global and workspace both present; the workspace value wins as settings do;
over 16 KB refused; "Remember this" appends after confirming; the prompt view shows it with its owner.

### Phase D — a chat you can read and review

**14. A turn as a story** → §8.7 (the call card, the conversation). UI only: `web/src/message-parts.ts` builds the
folds, a new `CallGroup.vue`, `CallCard.vue`'s closed line, `MessageItem.vue` for the final answer. Scenarios: folding
rules (what never folds), the fold's summary words per kind in `en` and `ar`, a live call open, right-to-left, the
"Jump to latest" behaviour unchanged. Worked when: a long turn's height falls (measure the Oct 12 chat before/after).

**17. The Changes view** → §8.5 (`file-changes`, `kvcoder.change.list`), §8.7 (the panel's list), §8.4 (Indexes).
A new collection and query in `src/files/`, the diff from `git diff` run as a short-lived process (no shell), the
panel entry in `ArtifactPanel.vue`. Scenarios: Git and non-Git workspaces; a file deleted since; Undo per file
refused when the file changed since (the existing rule); Commit sends the message; a helper's changes count for its
chat's root; delete removes the records.

**19. Narrow widths** → §8.7 (layout). `SessionList.vue` as a drawer, `MessageComposer.vue`, `ConversationView.vue`.
Scenarios at 400, 768, and 1440 px, both directions; Chromium checks of no overlap and a visible picker.

### Phase E — context and robustness

**1. Clearing old tool results** → §8.1 (what is sent, Compaction's measure). `src/turns/model-context.ts` (stubs),
the session's `clearedThroughSeq` moved in the step's begin transaction, `src/turns/read-again.ts`,
`src/turns/sent-size.ts`. Scenarios: idle-hour clearing; threshold clearing; the protected newest results; stubs keep
the call's line; a read after clearing returns the text again; a summary after clearing; cache: two steps in a row
send the same prefix. Worked when: rerun `prune.py` and the usage scripts: prompt tokens per call and summaries per
chat fall.

**6. The stalled stream** → plan 07 (kvai's call). Step 1: the gap measurement (kvai log field). Step 2:
`extensions/kvai/src/complete/model-call.ts`, an idle timer reset on each event; `failures.ts` maps it transient.
Scenarios with a scripted stream (fake clock): silence before the first event, between events, a slow but steady
stream not cut.

**5. The check after edits** → §8.3 (a call's result), §8.7 (Configuration). The setting; a run after
`evaluateCalls` in `src/turns/run-calls.ts`, beside `reminded`; the shell runner. Scenarios: runs once per reply;
not after a failed or waiting change; its timeout; output cut; off by default.

**8. The fallback model** → §8.1 (Model), §8.7. `src/turns/step.ts` (`stepFailed`), the setting, a notice
`MODEL_SWITCHED`. Scenarios: switch on each named code; no fallback configured; the fallback fails too.

**13. `web fetch`** → §8.5 (a new connector, one of kvcoder's own). The dependency (owner's choice), a query beside
the MCP connector, the private-address check (resolve, then refuse loopback, private, link-local), the per-domain ask.
Scenarios: text from HTML; a non-text type refused; private addresses refused, also after a redirect; size cut; the
first fetch per domain asks.

## Ledger

| Item | Phase | Decision | ADR | Scenarios | Status |
|---|---|---|---|---|---|
| 4 `replaceAll` | A | A1 | 0090 | QA58 | done |
| 2 `fs find` | A | A2 | 0090 | QA58 | done |
| 3 search context | A | A3 | 0090 | QA58 | done |
| 7 limits | A | A4 | 0090 | QA58 | done |
| 18 failure actions | A | A5 | 0090 | QA58 | done |
| 20 polish | A | A6 | 0090 | QA58 | done |
| 9 approval rules | B | B1–B4, B6 | 0091 | QA59 | done |
| 16 approval card | B | B3, B5 | 0091 | QA59 | done |
| 15 needs you | B | B7, B8 | 0091 | QA59 | done |
| 10 keep going | C | C1 | 0092 | QA60 | decided |
| 11 decide for me | C | C2 | 0092 | QA60 | decided |
| 12 preferences | C | C3 | 0092 | QA60 | decided |
| 14 turn as story | D | D1 | 0093 | QA61 | decided |
| 17 changes view | D | D2 | 0093 | QA61 | decided |
| 19 narrow widths | D | D3 | 0093 | QA61 | decided |
| 1 clearing | E | E1 | 0094 | QA62 | decided |
| 6 stalled stream | E | E2 | 0094 | QA62 | needs a week of gap measurement first |
| 5 check after edits | E | E3 | 0094 | QA62 | decided |
| 8 fallback model | E | E4 | 0094 | QA62 | decided |
| 13 web fetch | E | E5 | 0094 | QA62 | needs a dependency answer |

## Measuring the result

The scripts that found these numbers are in the review session's scratchpad (`stats.py`, `reads.py`, `prune.py`,
`cc.py`, `people.py`); they read the database read-only and are rewritten here if lost. After each phase, with a
week of real use, rerun them on chats newer than the phase's commit and record in this file: failed edits, `fs list`
chains, approval asks per chat, "continue" messages, chats left waiting, prompt tokens per call, and summaries per
chat.
