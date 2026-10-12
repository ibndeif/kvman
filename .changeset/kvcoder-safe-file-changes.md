---
"@kvman/kvcoder": minor
---

File changes are safe against each other: `fs write` and `fs edit` take turns across workers, refuse to change an existing file the chat has not read or that changed since it read it, and replace the file atomically with its permission bits. The new command `fs undo` takes back a chat's latest change to a file when the file hasn't changed since. The prompt now says that calls which change something run one after another.
