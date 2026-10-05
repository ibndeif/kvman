# ADR 0016 — Switching workspace while a chat is open

The product owner reported (2026-10-05) that switching workspace, or opening a new one, while a chat is open gives errors, and asked that the selected workspace's chat load instead, or a new chat when it has none. The cause: a session exists only in its own workspace (plan 08 §8.1), a workspace switch doesn't remount the page (plan 06 §6.4), and the session page kept reading the old session's id in the new workspace, every 5 s.

## Decisions

1. **The session page follows the workspace** (asked). When the tab's workspace changes while the `kvcoder.session` page is open, the conversation reads nothing more for the old session and opens the selected workspace's newest chat (the first of `kvcoder.session.list { limit: 1 }`), or the Chat page when it has none.
2. **The newest chat** (asked; chosen over the chat the tab last had open in that workspace, and over always a new chat).
3. **The Chat page stays the Chat page.** With no chat open, a switch changes nothing but the workspace the new chat would be made in.
4. **Until the page has moved, the conversation is empty**: neither the old chat nor the new-chat start shows. A second switch before the first has answered follows the last one. When the list can't be read, the Problem is toasted and the Chat page opens.

## Consequences

- Plan 08 §8.7 is corrected. No API changes: the fix is in kvcoder's conversation component, since kvwebui holds no product concept.
