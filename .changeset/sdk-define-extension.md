---
"@kvman/sdk": minor
"@kvman/protocol": minor
"@kvman/testkit": patch
---

SDK: `defineExtension`, the `Ext` registration types for permission, handler, and data calls, typed references (branded names), `Ctx` with `store` and `step`, `MigrationContext`, and `z` (Zod plus `blobId`, `text`, `action`); `ctx.store.collection` and `log` take references, and `log(family, key)`. Protocol: `toJsonSchemaDocument` and `matchesTypePattern`. Testkit: depends on the kernel and the SDK.
