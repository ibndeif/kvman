# ADR 0111 — What the schema endpoint lists

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

`12` §12.7 gives `kernel.schema.get`'s document, but leaves several things open:

- what fills the sections M2.1 does not build;
- the values of `shellVersion` and `contracts`;
- what is listed without a `workspaceId`;
- whether an owner sees its own `internal` types (`02` §2.4 says they are hidden "for other extensions");
- where an event's payload goes;
- the `scope` of kernel types;
- whether kernel error codes are listed.

## Decision

**The kvman version.** `kernelVersion` and `shellVersion` are both the kvman version (the kernel package's version, ADR 0089), because the shell ships with it. `protocolVersion` is `@kvman/protocol`'s.

**Which extensions are listed:**

- Without `workspaceId`: the kernel and every installed extension that is not quarantined, whether enabled or not.
- With `workspaceId`: the kernel and the extensions enabled in that workspace that are not quarantined. A workspace with no `workspaces` row fails `WORKSPACE_INVALID` (`no workspace <id> exists`).

**The sections:**

| Section | What it lists |
|---|---|
| `extensions` | `{ name, namespace, title, description, icon?, implements? }`, with `implements` left out when empty |
| `types` | The kernel's types and each listed extension's types, except `internal` ones (see below) |
| `entities` | `{ type: <entity name>, owner, description, schema, display }` |
| `errors` | The kernel's catalog with owner `kernel`, and each listed extension's registered codes |
| `contributions`, `contracts` | `[]`; UI recording lands in M2.10, and contracts are not yet defined |
| `components` | The 45 built-in specs from `@kvman/protocol`: owner `shell`, form `builtin`, props and event values as JSON Schema |
| `frameSlots` | The protocol's catalog |

**A type entry:**

- `owner` is the extension's name, or `kernel`; `namespace` is its namespace.
- `examples` is `[]` when none are declared.
- `lane` is `true` when a lane template is declared, else left out.
- `access` is set for commands and queries; `agentTool` and `slash` appear as declared.
- An event's payload is listed as `input`. A live event lists `chunk` and no `input`.
- `scope` is `global` for a command registered with `scope: 'global'`, `workspace` for every other extension type, and `global` for every kernel type (ADR 0099).

**Kernel error codes.** Each kernel code carries a description: the "When" column of `13` §13.2, added to the protocol catalog.

**Internal types** are omitted for every caller, the owning extension included.

**`GET /api/v1/schema?workspaceId=&q=`** answers the document itself (like `/health`). Its query parameters are the payload of `kernel.schema.get`.

## Consequences

- `02` §2.4 and `05` §5.5 now say internal types are hidden from `/schema` for everyone.
- `12` §12.7 records the rules above.
- `13` §13.2 is unchanged; the protocol's `kernelErrors` gains `description`, and the schema document's `errors` accept kernel codes as well as `<namespace>/UPPER_SNAKE`.
