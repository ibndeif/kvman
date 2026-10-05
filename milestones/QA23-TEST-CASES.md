# QA 23 — switching workspace while a chat is open (ADR 0016)

Reported: switching workspace, or opening a new one, while a chat is open gives errors; the selected workspace's chat should load, or a new chat when it has none. Decided in ADR 0016; plan 08 §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA23-H1 A switch opens the selected workspace's newest chat.** *Given* the chat `s1` open in `home`, *when* the tab's workspace becomes `other`, whose newest chat is `s9`, *then* `kvcoder.session.list { limit: 1 }` is read, the page is sent to `kvcoder.session { sessionId: 's9' }`, and no Problem is toasted. `extensions/kvcoder/test/web/workspace-switch.test.ts`
- **QA23-H2 A workspace with no chat opens a new chat.** *Given* the chat `s1` open, *when* the workspace becomes one with no chat, *then* the page is sent to `kvcoder.chat`. `extensions/kvcoder/test/web/workspace-switch.test.ts`
- **QA23-H3 In the real app.** *Given* kvman in Chromium with a chat in Home, two in a project folder, and an open empty folder, *when* the person opens Home's chat and picks the project in the workspace picker, *then* the project's newest chat shows at its URL; *when* they pick the empty folder, *then* the Chat page's start shows; and no error toast showed. `extensions/kvcoder/test/e2e/workspace-switch.test.ts`

## Edge cases

- **QA23-E1 Nothing is read for the old chat after the switch.** *Then* from the switch until the page has moved, no `kvcoder.session.get`, `kvcoder.message.list`, `kvcoder.turn.list`, or `kvcoder.artifact.list` runs with `s1`, the poll included, and the conversation shows neither the old chat nor the new-chat start. `extensions/kvcoder/test/web/workspace-switch.test.ts`
- **QA23-E2 The Chat page stays.** *Given* the Chat page with no chat open, *when* the workspace changes, *then* the page is sent nowhere and `kvcoder.session.list { limit: 1 }` isn't read by the conversation. `extensions/kvcoder/test/web/workspace-switch.test.ts`
- **QA23-E3 A second switch wins.** *Given* a switch whose list hasn't answered, *when* the workspace changes again, *then* only the last workspace's answer moves the page. `extensions/kvcoder/test/web/workspace-switch.test.ts`
- **QA23-E4 A failed list says so.** *Given* `kvcoder.session.list` fails after a switch, *then* the Problem is toasted once and the page is sent to `kvcoder.chat`. `extensions/kvcoder/test/web/workspace-switch.test.ts`
