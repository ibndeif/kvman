---
"@kvman/protocol": minor
---

The host frames of `03` §3.5 as Zod schemas (`invoke`, `rpc` with its calls, `rpcResult`, `complete`, and their parts: `HostWorkspace`, `RecordedValues`, `NewRecordedValues`, `CommandOptions`, `DeferredReply`, `HostUnitOfWork`), and `toJsonSchemaDocument(schema, view)` with `SchemaView`: inputs are converted in Zod's input view (ADR 0077).
