---
'@kvman/kvcoder': minor
---

The agent can write and edit files with the built-in `fs` connector (`fs write` and `fs edit`, inside the workspace folder, exact unique matching, CRLF and BOM kept). The `bash` tool now needs a `risky` field, and `kvcoder.shell.approval` defaults to `auto`: shell and `fs` calls ask the person only when the model marks them risky (`ask` still asks for every call).
