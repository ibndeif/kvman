---
"@kvman/protocol": minor
---

Unit-of-work writes (`kv.set`, `kv.delete`, `doc.put`, `doc.delete`, `log.append`, `log.truncate-before`, `log.drop`) and the outbound send shape; optional fields of every protocol schema are now exact optionals (`prop?: T`), matching `exactOptionalPropertyTypes`; the Unicode helpers are exported.
