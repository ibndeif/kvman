---
'@kvman/kvai': patch
---

A tool call's `toolcall` stream chunk reports a string argument over 16 KiB as `null`, so a very large call no longer fails its step against the 64 KiB progress-chunk limit; the returned call keeps the whole value.
