---
'@kvman/kvcoder': minor
---

A connector with settings of its own has a cog in the connectors list that opens them in a dialog. `shell`'s holds `kvcoder.shell.approval` and `kvcoder.shell.path`, saved as they change into the scope of the extension's page; the Shell card leaves `kvcoder.ui.get`'s configuration, which is now three cards, and the catalog key `kvcoder.config.shell` is removed (ADR 0020, 2 and 13).
