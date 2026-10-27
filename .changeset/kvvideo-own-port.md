---
"@kvman/kvvideo": patch
---

`video record` aborts the recorded page's requests to kvman's port whatever their host, since `0.0.0.0`, `127.0.0.2`, and `[::ffff:127.0.0.1]` reach kvman too.
