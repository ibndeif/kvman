---
'@kvman/kvcustomizer': minor
---

The `docs` connector reads every installed extension's docs: `docs list` shows the built-in guides (`sdk`, `i18n`, `presets`, from the testkit) and the pages each extension serves through its public `<namespace>.docs.list` and `.docs.get`, and `docs get` reads one. kvcustomizer pulls them, so nothing registers with it and a failing extension hides no other. kvcustomizer documents itself the same way, with the page `customizing`.
