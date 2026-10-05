# ADR 0017 — The conversation view after its first long chat

The product owner built a website in a chat and reported (2026-10-05): finished calls always show "0.0 s"; two calls are outlined and nothing says why; the ⋯ menu doesn't close on a click outside ("all menus must"); the header's controls and the artifact panel's header need a better arrangement; the workspace's tokens don't agree with the chat's; the send box takes no slash commands; and it should take files pasted from the clipboard. Decisions 1 to 6 were asked with alternatives and mockups. Decisions 7 to 14 are the smallest way to carry them out; the product owner may overrule any of them.

## What was found

A file call has two parts: the model writes the call (36 s for a 17 KB file), then kvman runs it (2 ms). The live line counted both; the finished card showed the run alone, to one decimal, so "0.0 s". The outlined calls were the failed ones (a folder that didn't exist; a command line given as the command's name), marked by their border only. The chat's header counts input and output tokens; kvai's workspace total adds the cached tokens every step reads again.

## Decisions

1. **A finished call shows the whole wait** (asked; chosen over both parts on the row, and over the run alone). Its time is the step's model time (the answer's `durationMs`) plus the call's own. When a step makes several calls, each shows that step's model time plus its own run. A call whose answer has no `durationMs` shows its run alone. Opened, the card says both parts: "Written in 36 s · ran in 2 ms".
2. **Times use the unit that fits** (asked): under a second, milliseconds ("2 ms"); under ten seconds, one decimal ("1.2 s"); under a minute, whole seconds ("36 s"); then minutes and seconds ("1 min 9 s").
3. **The model and the thinking level are in the send box** (asked; chosen over one button in the header, and over polishing the row), after the attach button, in a chat and on the Chat page alike. The header keeps the title, the totals, the Running chip, the artifacts button, and the menu. The Chat page has no header.
4. **The artifact panel's header is one row with icon buttons** (asked; chosen over a menu, and over polishing): the title (or the tabs, with several artifacts) with "<kind> · Version N" in small text under it, the Preview and Source switch, and icon buttons for "Open in a new tab", "Copy", and "Close", each with its name as label and tooltip.
5. **The token totals keep what they count, and say it** (asked; chosen over making both count input and output, and over making both count everything). kvai's status item reads "Workspace total, with cached: {tokens} tokens · {cost}".
6. **The send box takes slash commands for the chat's own actions** (asked; chosen over a registry for other extensions, and over none): `/compact`, `/export`, `/fork`, `/new`, `/prompt`, and `/rename <title>`. They run what the menu runs; nothing is sent to the model.
7. **A failed call says "Failed"** in a chip on its row, beside its danger border.
8. **The menu and the delete confirmation close on a press outside them and on Escape.** They were the only menus that didn't; kvwebui's dropdowns, the model pickers, and the Running list already did.
9. **The prompt is a menu item.** The Chat and Prompt tabs leave the header; the menu has "Show the prompt", and "Show the chat" while the prompt shows; the prompt view starts with a "Back to the chat" button.
10. **The artifacts button** is an icon with the count; its label and tooltip are "Artifacts (N)".
11. **Slash commands, in detail.** A text that is one line and starts with `/` is a command, in a chat only (the Chat page has no chat to act on, so it sends the text). A list above the box shows the commands whose name starts with what is typed, each with what it does; Up and Down move, Tab completes the name, Enter runs the highlighted one, and Escape hides the list until the text changes. A name no command has shows "No such command", and Enter does nothing. `/rename` with no title does nothing, and its row shows `/rename <title>`. A command that fails toasts its Problem, as the menu does.
12. **The model list in the send box opens upward**, as it does under a stopped turn.
13. **Pasting files.** A paste that holds files attaches them as the attach button does, and pastes no text; one that holds no file pastes as before. The attach button takes PNG, JPEG, GIF, and WebP images, and so does a paste: any other file isn't uploaded, and a toast says "Only images can be attached: <name>".
14. **A running call's phases** are unchanged: "Preparing…" while the model writes the call, "Running…" while it runs.

## Consequences

- Plan 07 §7.3 and plan 08 §8.7 are corrected. ADR 0009, 104, 177, 194, 195, and 214 are changed by this ADR. No command, query, or stored shape changes.
- The catalog keys `kvcoder.ui.duration`, `kvcoder.ui.chatTab`, and `kvcoder.ui.promptTab` are removed.
