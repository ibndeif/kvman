---
'@kvman/sdk': patch
'@kvman/kvwebui': patch
'@kvman/kvcoder': patch
---

The VS Code view, reviewed (ADR 0101). The new `kvman.host.offerNew(handler)` (typed in `@kvman/sdk/web`) offers the host's New button while embedded; kvcoder's conversation offers it, and its compact header then drops its own New chat. Embedded kvwebui lists panels and a Language row in its pages menu, opens panels as a sheet, shows the status items in a slim line at the bottom, looks compact (smaller spaces and titles, thin scrollbars), and, when kvman stops answering, tells the host (`kvman.lost`) instead of showing a toast. The page's scrolling area now contains what it holds, so nothing stretches the document, and an identical toast that is open isn't shown again. kvcoder's composer keeps its pickers whole at side-bar width, and its menus close when the focus leaves them and open toward the side that has room.
