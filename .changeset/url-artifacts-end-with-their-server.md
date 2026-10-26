---
'@kvman/kvcoder': patch
---

url artifacts end with their server (ADR 0104). When a chat's background process ends, by itself, by `background stop`, by the person's Stop, or because kvman stopped (then at the chat's next message), the chat's `url` artifacts at the port of a localhost link in its output are deleted. The message that reports the ending says which, and `background stop` returns them in `deletedArtifacts`. The person's Restart and an exit inside the startup second delete nothing.
