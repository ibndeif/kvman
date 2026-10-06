---
'@kvman/kvbuilder': minor
'@kvman/testkit': patch
'@kvman/kvwebui': patch
'@kvman/kvcoder': patch
---

kvcustomizer is renamed to kvbuilder, shown as "kvman builder" (ADR 0027, 7): the package is `@kvman/kvbuilder`, its namespace `kvbuilder`, its commands and queries `kvbuilder.*`, and its errors `kvbuilder/*`. The `coder` preset lists it. A preset of your own that names `@kvman/kvcustomizer` must name `@kvman/kvbuilder` instead. The docs of the testkit, kvwebui, and kvcoder use the new name.
