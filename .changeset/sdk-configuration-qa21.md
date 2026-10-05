---
'@kvman/sdk': minor
---

`@kvman/sdk/web` gains the `setting` view (`{ type: 'setting', key }`, one of the extension's own settings as a row, valid only in a `ui.get` `configuration`) and `Kvman.scope`, a live read-only ref that says where the extension's page is set to save (`'global'` or `'workspace'`) (ADR 0014).
