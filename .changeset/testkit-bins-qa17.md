---
'@kvman/testkit': minor
---

The testkit gains the tools for building extensions with any harness, or none: `kvman-new` (scaffold an extension project with its platform guides, `AGENTS.md`, and a docs pair), `kvman-preset new|check`, `kvman-preview` (a preview kvman on a temporary home, until Ctrl+C), and `kvman-docs list|get` (the guides and the pages every installed extension serves). `kvman-check` also warns about a half-done or wrong `<namespace>.docs.list` and `.docs.get` pair. The package exports `./package.json`, and ships `docs/` (the guides `sdk`, `i18n`, `presets`) and `templates/`.
