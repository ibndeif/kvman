---
'@kvman/kvcustomizer': minor
---

The `docs` connector reads every installed extension's docs: `docs list` shows the built-in guides (`sdk`, `i18n`, `presets`, from the testkit) and the pages each extension serves through its public `<namespace>.docs.list` and `.docs.get`, and `docs get` reads one. kvcustomizer pulls them, so nothing registers with it and a failing extension hides no other. kvcustomizer documents itself the same way, with the page `customizing`.

The `kvman` connector changes the app the agent runs in: `model-list` and `model-set`, `settings-list`, `settings-set` and `settings-reset`, `extensions-list`, `extensions-install` and `extensions-uninstall`, and `preset-get`. Model and settings changes apply at once; extension and preset changes are saved to the preset file and apply at the next start. No call touches a secret.
