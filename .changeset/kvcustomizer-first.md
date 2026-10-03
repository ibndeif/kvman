---
'@kvman/kvdev': minor
---

kvdev: the harness for developing kvman extensions and presets, on kvcoder. Its connectors are `ext` (`new` scaffolds a project, plain or with a Vue component, and runs `npm install`; `list`; `check` runs TypeScript and `kvman-check`; `test` runs `npm test`), `preset` (`new` and `check`), `preview` (`start` runs a second kvman with the projects as `path:` extensions on a temporary home, plus their `web:watch`; `stop`; `status`), and `docs` (six guides). It adds one global prompt section.
