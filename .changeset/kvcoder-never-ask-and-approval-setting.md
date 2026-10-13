---
"@kvman/kvcoder": minor
---

A third approval mode, "Never ask" (`never`): no call asks you, including commands an extension marked as needing approval and worker programs set to ask; the agent's own questions still wait. Choosing it asks you to confirm first. The approval setting moved from the `shell` connector's dialog to the Agent card of Coder's page.

**Breaking:** the setting's key is now `kvcoder.approval` (it was `kvcoder.shell.approval`). A saved value is not carried over, so a choice of "Ask for every call" returns to the default until you choose it again, and a preset that names the old key must be edited.
