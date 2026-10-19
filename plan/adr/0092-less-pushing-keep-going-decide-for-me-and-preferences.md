# ADR 0092 — less pushing: keep going, "Decide for me", and the person's preferences

Status: accepted by the product owner on 2026-10-19 (every recommended option). It amends plan 08 §8.1, §8.2, §8.5,
§8.6, and §8.7.

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase C) read the owner's own messages:

- The owner typed "continue" 24 times. Eight of them were in one review chat, each after the agent ended a turn with
  a status report while the work it had been asked for was not done ("KVC-08 remains the only completed fix").
- Within 15 minutes, in three chats, the owner skipped the agent's question and wrote "ابتكر كل شئ ومتسالش تاني"
  ("invent everything and don't ask again"). The owner chose the agent's first, recommended option in 110 of 149
  choices.
- The owner repeated the same wishes in new chats (don't ask; the apps they build are Arabic), since nothing carried a
  person's preferences from one chat to the next. Claude Code keeps them in a user memory file the person edits.

## Decisions

1. **Keep going** (asked; recommended: a prompt rule and a button). The rules both methods end with gain: when the
   person asked for several items, or the map has ready steps, keep working until all are done or something blocks
   the work, and report once at the end, not after each batch; a reply with no call ends the turn, so only a finished
   task, a blocker, or a question the person must answer ends it. Under the line "N steps of the execution map are not
   done." a **Continue** button sends "Continue." (in the page's language) as the person's message. kvman still starts
   nothing itself (ADR 0064, 11 unchanged).
2. **Decide for me** (asked; recommended: a per-chat switch that takes `ask` away). A session record has `decides`
   (old records read `false`), shown in the session view and set with `kvcoder.session.configure { decides }`, from the
   next step. While it is `true`:
   - the chat has no `ask` connector: it is not in the index or the `run` tool's enum, and a call to it gets the answer
     for a connector that doesn't exist;
   - the lead's prompt ends its method with: the person asked you to decide in this chat, so make each choice
     yourself, the one you would recommend, say in a line what you chose and why, and go on; approvals still ask.
   The send box has the switch "Decide for me" beside the thinking picker, `aria-pressed`, off by default; on the Chat
   page it is set on the chat it creates, as the model is. Approvals are unaffected, and so are helpers, which never
   have `ask`.
3. **The person's preferences** (asked; recommended: a setting in both scopes, written only by the person). The setting
   `kvcoder.preferences` (text up to 16 KB, global and workspace scopes, default `''`) is sent, when not empty, as the
   prompt section "The person's preferences" right after the base prompt, before the other sections, opening with
   "These are the person's own standing preferences for every chat. Follow them unless the person says otherwise in
   this chat."; it counts toward the sections' 64 KB. The Agent card has its row: a text area with Save, "Changed" and a
   reset as other rows. A message the person sent has **Remember this** among its actions: it shows the text in a
   confirmation ("Add this to your preferences? Every chat reads them."), and **Add** appends it, on its own line, to
   the value in effect (the workspace's when the workspace has its own, else the global one); a value that would pass
   16 KB fails as the setting does. The agent has no way to write it.

## Consequences

- A long task given as a list runs to its end without "continue", unless the model stops anyway; then the person
  presses Continue instead of typing.
- A person who wants the agent to stop asking says so once per chat with the switch, or once for all chats in the
  preferences.
- Changing the switch or the preferences changes the prompt, so the provider's cache is rebuilt once.
