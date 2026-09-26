---
"@kvman/protocol": minor
---

Add the extension lifecycle shapes (M2.2): the payloads and results of `kernel.extension.stage`, `install`, and `uninstall`, `kernel.extensions.list`, and `kernel.extension.get`; the `kernel.extension.installed`, `kernel.extension.uninstalled`, and `kernel.preset.changed` event payloads; the install pipeline's files (`files.json`, the builtin `digests.json`, the package.json fields it reads, npm version metadata) and the install-time loader's messages. `NOT_FOUND` now also covers an unknown extension.
