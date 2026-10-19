# QA 60 — Less pushing: keep going, "Decide for me", and the person's preferences (ADR 0092)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase C) found 24
"continue" messages after turns that stopped with work left, three chats where the owner skipped a question and asked
the agent to stop asking, and wishes repeated in each new chat.

**The owner chose** every recommended option: a prompt rule and a Continue button; a per-chat "Decide for me" that
takes `ask` away; `kvcoder.preferences` in both scopes, in every prompt, with "Remember this", written only by the
person.

Paths are relative to the repository root.

## Happy path

- **QA60-H1 the method says to keep going.** *Then* the rules both methods end with say to keep working through
  several items or the map's ready steps until all are done or something blocks the work, reporting once at the end,
  and that only a finished task, a blocker, or the person's question ends a turn.
  `extensions/kvcoder/test/unit/prompt-method.test.ts`
- **QA60-H2 Continue sends "Continue."** *Given* an idle chat whose map has steps not done, *when* the person presses
  Continue, *then* `kvcoder.message.send` gets `Continue.` (in Arabic `تابع.`). `extensions/kvcoder/test/web/map-continue.test.ts`
- **QA60-H3 Decide for me takes `ask` away and says so.** *Given* a chat configured with `decides: true`, *then* its
  next step's index and `run` enum have no `ask`, its prompt ends the method with the decide line, and a call to `ask`
  gets the answer for a connector that doesn't exist. `extensions/kvcoder/test/decide-for-me.test.ts`
- **QA60-H4 the switch sets it.** *Given* a chat, *when* the person presses "Decide for me", *then*
  `kvcoder.session.configure { sessionId, decides: true }` runs and the switch is pressed; pressed again it sends
  `false`; on the Chat page it is set on the chat it creates. `extensions/kvcoder/test/web/decide-switch.test.ts`
- **QA60-H5 the preferences are in every prompt.** *Given* `kvcoder.preferences` `Build apps in Arabic first.`, *then*
  a lead's and a helper's prompt hold the section "The person's preferences" with its opening and the text, right
  after the base prompt; with `''` there is no section. `extensions/kvcoder/test/preferences.test.ts`
- **QA60-H6 the Agent card edits them.** *Then* the row shows the value in a text area, Save writes it in the scope
  being edited, and "Changed" and the reset follow the setting. `extensions/kvcoder/test/web/preferences-setting.test.ts`
- **QA60-H7 Remember this appends a message.** *Given* preferences `Use pnpm.` set globally, *when* the person presses
  Remember this on their message `Never push.` and then Add, *then* the global value is `Use pnpm.\nNever push.`.
  `extensions/kvcoder/test/web/remember-this.test.ts`

## Edge cases

- **QA60-E1 off again restores `ask` from the next step.** *Then* `decides: false` brings `ask` back, and a question
  already waiting when it was turned on still waits. `extensions/kvcoder/test/decide-for-me.test.ts`
- **QA60-E2 approvals still ask while deciding.** *Then* a risky call in a chat with `decides: true` still asks.
  `extensions/kvcoder/test/decide-for-me.test.ts`
- **QA60-E3 a helper is unaffected.** *Then* a helper of a deciding chat has no `ask` and no decide line, as before.
  `extensions/kvcoder/test/decide-for-me.test.ts`
- **QA60-E4 a session stored before has `decides` false.** *Then* an old record parses with `decides: false` and its
  view says so. `extensions/kvcoder/test/unit/old-records.test.ts`
- **QA60-E5 the workspace's preferences win.** *Given* global and workspace values, *then* the prompt holds the
  workspace's only; over 16 KB is refused `VALIDATION_FAILED`. `extensions/kvcoder/test/preferences.test.ts`
- **QA60-E6 Remember this into the workspace, cancel, and too long.** *Then* with a workspace value it appends there;
  Cancel writes nothing; a value that would pass 16 KB shows the Problem and changes nothing.
  `extensions/kvcoder/test/web/remember-this.test.ts`
- **QA60-E7 only the person's messages offer Remember this.** *Then* the agent's replies, background results, and
  notices don't have it. `extensions/kvcoder/test/web/remember-this.test.ts`
