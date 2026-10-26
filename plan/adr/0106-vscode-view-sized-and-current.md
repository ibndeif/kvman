# ADR 0106 — The VS Code view, sized to read and kept current

Status: accepted, 2026-10-26. It changes ADR 0099 (17), ADR 0100 (12 and 24), plan 06 §6.2, plan 08 §8.7, plan 15 §15.3 and §15.4, and plan 13 (milestone M4.8).

The product owner asked (2026-10-26): "Review the entire user experience and ui as there are some issues like font is too small and other issues you need to identify and fix", and "ensure that it uses the latest versions of kvman packages".

A review in a real VS Code (1.143.1, driven through its debugging port, on a copy of the owner's chats) found:

- **The text was too small.** kvwebui took VS Code's 13 px as its root size, so every rem-based size shrank to 81%: chat text was 11.4 px, code 10.2 px, and the status line 9.75 px, where VS Code's own side bar text is 13 px.
- **The chat header took three rows** (about 150 px of an 830 px view) at side-bar width: the title, then "Background (50)" and the artifacts button, then "…" alone. Plan 08 §8.7 says one row.
- **The chat's "…" menu opened off the view's edge**, cut off, since its button had wrapped to the row's start.
- **The person's own messages had no bubble**, and a selected tab no fill: the view sent the same color as `background` and `surface`.
- **The artifact panel's name was cut to one letter** ("I…") beside the switch and four icon buttons.
- **The status line wrapped onto two lines** of 9.75 px text, and began with "Waiting for you: 0".
- **Arabic chat titles read in the wrong order** in an English page, in the header and the chat list.
- **The new-chat heading was 26 px** in a 300 px side bar.
- **An older kvman could run behind a newer extension**: the extension accepted any kvman from 0.4.7, and never looked at the version of a kvman it joined. The owner's PATH had 0.4.6 while npm had 0.4.7.

Decisions 1 to 7 were asked with alternatives and mockups. Decisions 8 to 12 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **The host's font size is the size of body text** (chosen over the browser's 16 px root; changes ADR 0100, 12). kvwebui sets its root font size to `fonts.size × 8 / 7`, so its body text (`0.875rem`) is the host's size: 13 px in VS Code, with small text near 11 px and code near 11.7 px. It follows the person's VS Code font size.
2. **The narrow chat header is one row, with icon-and-count chips** (chosen over moving the buttons into "…"). Below 30 rem of the workspace's width the conversation header doesn't wrap: the title and its totals share the row's free width, one over the other, each cut with an ellipsis, and the Background chip shows an icon with its count, as the map, changes, and artifacts buttons do, its words staying its label and tooltip. "…" is then always at the row's inline end, so its menu opens inside the view.
3. **The view sends a soft fill as `background`** (chosen over VS Code's input or editor color; changes ADR 0100, 24). `background` is `color-mix(in srgb, <foreground> 6%, <surface>)`, where `surface` is the side bar's color in the view and the editor's in the Settings tab, so bubbles, cards, and selected tabs show in light, dark, and high-contrast themes. An embedded page's own ground, behind its content and its status line, is `surface`, so the page stays flush with the host and only those parts take the fill.
4. **kvman must be at least as new as the extension** (chosen over also asking npm daily, and over checking the program only; changes ADR 0099, 17). The extension and kvman are released together at the root version, so `<kvman.path> --version` older than the extension's own version shows "kvman `<version>` is older than this extension needs (`<extension version>`)." with "Update kvman", which installs `kvman@latest`. `MINIMUM_KVMAN_VERSION` goes.
5. **A joined kvman's version is checked too.** On a `joined` line, the extension calls `kernel.health.get` on the line's port (2 seconds, as plan 15.5). When it answers with a version older than the extension's, the view shows "kvman `<version>` is already running, and this extension needs `<extension version>`. Quit it, then start again." with "Start again", which starts kvman again (plan 15.3, step 4), and "Open anyway", which frames the running kvman (chosen over offering Start again only, and over not checking). A kvman that doesn't answer, or answers without a version, is framed as before; a lost one is then found as plan 15.5 says.
6. **The artifact panel's name has its own row at side-bar width** (chosen over keeping one row). Below 30 rem of the workspace's width, where the panel lies over the whole chat, the head wraps (a desktop window, whose panel is often under 30 rem beside the chat, keeps its one row): the name or the picker, with its kind and version, takes the first row at full width, and the switch and the icon buttons are a second row at the inline end.
7. **A status item whose count is 0 isn't shown**, in the browser's status bar and in the embedded status line alike (chosen over only when embedded, and over keeping it). It is an item with `titleCount` whose field is 0; its query keeps running, so it shows again when the count rises. The embedded status line is hidden while it shows nothing.

### The smallest way to carry them out

8. **The embedded status line is one line**, as plan 06 §6.2 says: its items don't wrap, and the line is cut with an ellipsis; each item keeps its text as a tooltip.
9. **Chat titles read in their own direction.** The header's title and each title in the chat list have `dir="auto"` and keep the page's alignment (`text-align: match-parent`), so an Arabic title in an English page (or the reverse) reads in its order and is cut at its own end.
10. **The new-chat heading is 20 px** below 30 rem of the workspace's width (26 px otherwise).
11. **A long word in an artifact wraps** at side-bar width, so the panel doesn't scroll sideways; code blocks still scroll.
12. **The view's own states keep VS Code's size**: the extension's pages (Starting, Install, Update, Failed, the older kvman) already use `--vscode-font-size`; the new state uses the same message, buttons, and texts in `en` and `ar`.

## Plan changes

- `06-kvwebui.md` §6.2: the root font size from the host's `fonts.size`; a status item at 0 hidden; the status line one line, hidden while it shows nothing.
- `08-kvcoder.md` §8.7: the narrow header in one row with the Background chip as an icon and its count; the artifact head's two rows below 30 rem; chat titles in their own direction; the new-chat heading's size.
- `15-vscode.md`: §15.3 step 2 the extension's own version, and the joined kvman's version in step 5; §15.4 the theme's `background`.
- `13-milestones.md`: M4.8.
