# ADR 0101 — The VS Code view, reviewed

Status: accepted, 2026-10-22. It changes ADR 0100 (decisions 7, 10, 13, 15, and 29), plan 06 §6.2 and §6.4, plan 08 §8.7, plan 15, and plan 13 (milestone M4.7).

The product owner used the extension of ADR 0100 and said (2026-10-22): "The user experience now is better but it is not sufficient … there are a lot of issues where some panels doesn't open and others not working and others are missing like language switcher … Review the entire extension, make everything work as expected and ensure it is reliable and efficient."

A review in a real VS Code (1.141.2, driven through its debugging port) found:

- **Pages and "Add to kvman chat" did nothing.** The view's page passed on the extension's messages only when `event.source === window.parent`. VS Code delivers them from its host window, but in the page's realm that window isn't `window.parent`, so every one was dropped (the fix of ADR 0100, 29 was tested with a fake that assumed otherwise).
- **The frame was 40 px narrower than the side bar**: VS Code gives a webview's `body` 20 px of inline padding, and the page reset only its margin. The Settings tab had the same gutters.
- **The Models page scrolled twice**: a visually hidden label with `position: absolute` and no positioned ancestor stretched the document past the page's own scrolling area.
- **The composer's pickers were squeezed** into a clipped group at side-bar width, one picker's menu stayed open when another opened, and the thinking menu spilled past the composer.
- **"Add to kvman chat" from the palette with no selection did nothing**, silently.
- **A second window lost kvman for good** when the window that started it closed: its view showed a growing stack of "kvman didn't answer" toasts until it was hidden and shown again.
- **Missing in VS Code**: the language menu, the status items (waiting chats, the chat's tokens and cost, kvai's usage), and panels, all of which live in the frame that the embedded page hides.
- **A restart could leave Pages and inserted text dead**: a `running` line after the frame had said `kvman.state` marked the frame as not ready, and nothing made it ready again.

Decisions 1 to 5 were asked with alternatives and mockups. Decisions 6 to 15 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **A Language row in the pages menu** (chosen over following VS Code's display language, and over both). Below the pages, the embedded pages menu has "Language" with the current language's name (when the catalogs have more than one language); it opens the list of languages the catalogs have, each named in itself, and a pick saves `kernel.language`, as the browser's language menu does, so the browser and the desktop app follow.
2. **A slim status line at the bottom of the embedded page** (chosen over a footer of the pages menu, and over leaving it out). It holds the contributed status items as the status bar does (the same order, `kvwebui.status.hidden`, and route params), without the workspace folder, which VS Code shows. kvman's health shows only when kvman doesn't answer: "kvman doesn't answer. Reconnecting…". The line is hidden when it has nothing to show.
3. **The frame tells the host when kvman is gone, and the host starts it again at once** (chosen over the extension checking every 5 s, and over plan 15.5 alone). While embedded, the first call that finds kvman not answering (`kvwebui/OFFLINE`) posts `{ kind: 'kvman.lost' }` to the host, once until a call reaches kvman again. That Problem shows no toast while embedded; the status line says it. The VS Code extension answers `kvman.lost` in a window that doesn't own kvman by checking `kernel.health.get`, and, when nothing answers, starting kvman again (plan 15.3, step 4): the window then owns the new kvman, or joins one another window started first, and the view loads the frame afresh.
4. **Extras**, all chosen:
   - **"Add to kvman chat" with no selection adds the open editor's file**, as the explorer's file is added.
   - **Ctrl+Alt+K** (Cmd+Alt+K on macOS) runs "Add to kvman chat" while an editor has the focus.
   - **Panels open as a sheet while embedded**: a panel opens over the page at the frame's full width, with its title and a close button, and the pages menu lists the panels after the nav items; a press on an open panel's item closes it. A `panel` effect opens and closes the sheet as it does the panel area.
5. **A generic "New" slot in the host's title bar** (chosen over a picker of page actions, and over keeping New chat in the page only). This changes ADR 0100, 7.
   - The manifest declares one title-bar button, "New" with VS Code's `add` icon, first in the view's title bar, shown only while the context key `kvman.canNew` is true.
   - A page offers it with `kvman.host.offerNew(handler)` (plan 06 §6.4), which returns the offer's removal. kvwebui posts `{ kind: 'kvman.actions', new: boolean }` to the host after each change of whether any offer is held; the host sets `kvman.canNew` from it, and sets it false while no frame is ready.
   - A press sends `{ kind: 'kvman.new' }` to the frame, and kvwebui calls the latest offer's handler.
   - kvcoder's conversation offers New while embedded, and its compact header then has History only; outside embedded mode it is as before.

### The smallest way to carry them out

**The extension (plan 15)**

6. **The extension's messages are known by the page's own origin** (changes ADR 0100, 29). The page passes a message on to the frame when `event.origin` is the page's own origin, and only `kvman.pages`, `kvman.new`, and `kvman.insert` with a text. The browser sets `event.origin` and no page can claim another's: kvman's frame and any frame inside it, such as an artifact, are at other origins, and the page's policy frames only `http://127.0.0.1:<port>`.
7. **The pages have no padding of their own**: `body` has no padding, so the frame fills the view and the Settings tab.
8. **Each start loads a new frame.** The frame view carries the number of the start that made it, so a frame of a new start is loaded again even at the same address, while a `running` line of the same start at the same address (after a `restarting` line) keeps the frame and whether it is ready, since kvwebui reloads by itself after a restart (plan 15.3). A line at another port moves the frame, as before.
9. **`kernel.health.get` has 2 seconds to answer**; a kvman that doesn't answer in time counts as one that doesn't answer.
10. **Each webview's subscriptions end with it**, so a view that VS Code disposes and resolves again, or a closed Settings tab, leaves no listener behind.
11. **The manifest's description** says the primary side bar (ADR 0100, 5).

**kvwebui (plan 06)**

12. **The embedded root has the class `kvwebui-embedded`.** Under it the theme spaces for extensions are compact (`--kv-space-sm` 6 px, `--kv-space-md` 10 px, `--kv-space-lg` 12 px, `--kv-radius` 8 px), page titles are `1.25rem`, and scrollbars are thin, in the host's muted color.
13. **The page's scrolling area is the containing block** of what it holds (`position: relative`), so nothing absolutely positioned stretches the document; the embedded document never scrolls itself.
14. **Identical toasts show once**: a toast with the same text, values, level, and hint as one that is open isn't added again.

**kvcoder (plan 08)**

15. **The composer at side-bar width** (below 30 rem of conversation width): the pickers keep their icon size and don't shrink, their chevrons and the buttons' extra padding go, the "Enter sends" hint is hidden, and the composer's inline padding is the theme's `--kv-space-md`. Opening one picker's menu closes the other's, and a menu opens toward the inline end only when it fits, else toward the inline start.

## Plan changes

- `06-kvwebui.md` §6.2: the embedded page's language row, panels sheet, status line, `kvwebui-embedded` class; the host messages `kvman.lost`, `kvman.actions`, and `kvman.new`; no OFFLINE toast while embedded; identical toasts once. §6.4: `kvman.host.offerNew`.
- `08-kvcoder.md` §8.7: the conversation offers New while embedded; the compact header then has History only; the composer at side-bar width.
- `15-vscode.md`: §15.2 the title bar's New; §15.4 the extension's messages by origin, `kvman.lost` and `kvman.actions`, no body padding; §15.5 starting again on `kvman.lost`, each start's frame; §15.6 the open file, Ctrl+Alt+K.
- `13-milestones.md`: M4.7.
- CLAUDE.md §3: the view is in the primary side bar.
