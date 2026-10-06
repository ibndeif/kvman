# ADR 0028 — A registered slash command runs on the Chat page

The product owner installed release 0.2.0, typed `/build-kvman` on the Chat page, and found it disabled (2026-10-07): "the slash commands are disabled such as build kvman command". ADR 0018, 5 greys the whole list while there is no chat, and ADR 0027, 9 kept that for registered commands. That rule was written when every command acted on an existing chat; `/build-kvman` starts one, and it is what a person types first.

Decision 1 was asked with alternatives and mockups. Decisions 2 to 6 are the smallest way to carry it out; the product owner may overrule any of them.

## Decisions

1. **On the Chat page a registered command runs** (chosen over also hiding kvcoder's own six there, and over keeping everything greyed with a clearer line). The send box creates the chat, runs the command in it, sends its message, and opens the chat. kvcoder's own six (`/compact`, `/export`, `/fork`, `/new`, `/prompt`, `/rename`) stay greyed there, since they act on a chat that exists. This reverses the last sentence of ADR 0027, 9, and narrows ADR 0018, 5 to kvcoder's own commands.
2. **The order is the first message's.** `kvcoder.session.create {}`; then `kvcoder.session.configure` with the model and thinking level the person picked, only when they picked one; then the entry's `command` with `{ sessionId, argument }`; then, when the entry has `message`, `kvcoder.message.send` with the argument, or with none the translated `message`; then the chat opens (`kvcoder.session`). An entry without `message` sends nothing, and the chat opens empty.
3. **The list on the Chat page.** The rows are the same, in the same order. A registered row isn't greyed. The line "Send a first message to use commands" shows only while the list has a greyed row. The first row that can run is highlighted; Up and Down move over the rows that can run, Tab completes one, and Enter or a click runs it. When no listed row can run, none is highlighted and Enter does nothing, as before.
4. **A box that can't send runs nothing.** While no model is ready (the box is blocked, as for a first message), Enter and a click create no chat, run nothing, and keep the text (ADR 0019, 3).
5. **A failure.** A step that fails shows its Problem as a toast, and nothing after it runs: nothing is sent, and the Chat page stays. A chat that was already created stays in the list, as it does when a first message fails.
6. **The box empties** when the command starts, as in a chat.
