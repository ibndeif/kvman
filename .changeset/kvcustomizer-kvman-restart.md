---
'@kvman/kvcustomizer': minor
---

The `kvman` connector gains `restart`, which runs the public command `kvcustomizer.app.restart` (`{}` → `{ restarting: true }`) and asks the person first (ADR 0024, 7). The guide that `kvman init` returns says to finish a change to the extensions with one `restart` call, what to say about what stops, that the terminal may ask the person to trust a new extension, and to read `health-get` afterwards for `rolledBack`. "You can't restart it yourself" is gone.
