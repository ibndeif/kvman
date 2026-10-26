---
'@kvman/kvwebui': patch
'@kvman/kvcoder': patch
---

The VS Code view, sized to read (ADR 0106). An embedded page now takes the host's font size as the size of its body text (the root is `fonts.size × 8 / 7`), so chat text matches VS Code's 13 px instead of 11.4 px, and its own ground is the surface color. A status item whose count is 0 isn't shown, in the status bar and the embedded status line, and the embedded status line stays on one line. At side-bar width kvcoder's chat header is one row, with the Background chip as its dot or an icon and its count, so the chat's menu opens inside the view; the artifact panel's name gets its own row, and a long word in an artifact wraps; chat titles read in their own direction; and the new-chat heading is smaller.
