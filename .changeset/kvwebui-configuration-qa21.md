---
'@kvman/kvwebui': minor
---

The Settings page holds only kvman's own settings. Each extension has its own page under Extensions (`/kvwebui/extension/<namespace>`) with the `configuration` view its `ui.get` gives, one switch for where changes are stored, and its secrets. A new view component, `setting { key }`, shows one of the extension's settings there, and custom components read the switch as `kvman.scope`. The Extensions page no longer lists commands, queries, or handlers (ADR 0014).
