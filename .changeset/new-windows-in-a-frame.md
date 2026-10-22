---
'@kvman/sdk': patch
'@kvman/kvwebui': patch
'@kvman/kvcoder': patch
---

kvwebui embedded in a host, and who may frame kvman (ADR 0099, ADR 0100). kvman's answers carry a `frame-ancestors` policy, so only kvman itself, local pages, and VS Code can show it in a frame. kvwebui opened with `?embed=parent` runs inside a host's frame, such as the VS Code extension's view: it has no top bar, nav, or status bar, takes the host's colors and fonts, opens a pages menu when the host asks, and hands new windows to the host (a `target="_blank"` web link, or the new `kvman.open(url)`). The new `kvman.host` (typed in `@kvman/sdk/web`) asks the host to open a file, a diff, or a Git change, and receives text the host inserts. kvcoder's MCP sign-in opens its address with `kvman.open`. kvcoder at a narrow width puts History, the chat's header, and New chat in one row; embedded, it shows "Open diff" on file edits and writes (the new read-only query `kvcoder.file.preview.get` gives the proposed file), opens file paths in the host's editor, and puts text the host inserts into the send box.
