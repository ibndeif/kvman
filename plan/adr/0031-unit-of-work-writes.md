# ADR 0031 — Unit-of-work writes and version checks

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.1
- **Decided by**: the product owner

## Question

`04` §4.2 names the writes of a unit of work (`KvWrite`, `DocWrite`, `LogAppend`, `LogTruncate`, "each with expectedVersion when known") but not their fields or the version rules. The SDK builds the unit in the host and the kernel commits it, so the shape lives in `@kvman/protocol`.

## Options

1. **Writes without owner or workspace** (the kernel takes both from the invocation), with `expectedVersion` 0 meaning "read nothing".
2. The same, with `owner` and `ws` on each write, checked by the kernel.

## Decision

Option 1:

```ts
type StoreScope = 'workspace' | 'global';                       // ws = '' for global
type KvWrite = { kind: 'kv.set'; scope; key; value: Json; expectedVersion? } | { kind: 'kv.delete'; scope; key; expectedVersion? };
type DocWrite = { kind: 'doc.put'; scope; collection; id; data: JsonObject; expectedVersion? }
              | { kind: 'doc.delete'; scope; collection; id; expectedVersion? };
type LogAppend = { kind: 'log.append'; scope; log; seq; value: Json };
type LogTruncate = { kind: 'log.truncate-before'; scope; log; seq } | { kind: 'log.drop'; scope; log };
```

- The owner and workspace of every write come from the invocation, never from the unit, so a unit cannot write another extension's data.
- `expectedVersion` absent: a blind write (the key was never read). `0`: the read found nothing, and the entry must still not exist. `n`: the entry must still be at version `n`.
- Versions start at 1 and increase by 1 per write; a delete removes the row.
- A version mismatch, or a log `seq` already taken, fails that unit alone with `STORAGE_CONFLICT`.

## Consequences

`04` §4.2 shows the write types.
