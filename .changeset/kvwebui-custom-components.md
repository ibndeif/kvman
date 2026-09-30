---
'@kvman/kvwebui': patch
---

kvwebui: custom components from extensions' `kvman.web` folders, sharing kvwebui's Vue through an import map, with their CSS, the extension's revision in their URLs, and an injected `kvman` (`exec`, `execAsync`, `stream`, `follow`, `navigate`, `toast`, `panel`, `t`, `workspace`, `View`); the `--kv-*` theme variables for light and dark; and effects (`kvwebui.effect.add`, `kvwebui.effect.take`, and an hourly `kvwebui.effect.clean`) applied when a job the UI started or follows ends.
