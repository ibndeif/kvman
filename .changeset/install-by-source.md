---
'@kvman/sdk': minor
'@kvman/kvwebui': minor
'@kvman/kvcustomizer': minor
---

An extension is installed by its source alone (ADR 0025). `kernel.extensions.install` takes `{ source }`, where `source` is `bundled:<name>`, `npm:<name>@<exact version>`, or `path:<folder>`, whose name the kernel reads from the folder's package.json; `@kvman/sdk` gains `installSourceSchema` and `InstallSource`. The Extensions page's form has one field, the source, and kvcustomizer's `kvman extensions-install` takes `{ source }`.
