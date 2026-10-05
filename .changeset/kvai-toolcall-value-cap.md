---
'@kvman/kvai': patch
---

A streamed `toolcall` chunk sends `null` for any argument value over 16 KiB, counting an object's or array's JSON, not only a string's bytes (ADR 0011, 22). A tool with a large nested argument can no longer pass the 64 KiB progress-chunk limit. The returned message keeps the whole value.
