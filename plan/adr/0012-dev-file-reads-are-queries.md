# ADR 0012 — Dev-project reads are queries

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

Two parts of the plan disagreed with the naming grammar (`02` §2.4) and with D6 (a read is a query):

- `03` §3.8 listed `kernel.dev.file.read` and `kernel.dev.file.list` as commands; `list` is a read verb, which a command name may never end in.
- `11` §11.4 said the builder's read tools are queries, but its table listed `builder.file.read` and `builder.dir.read` as commands.

## Options

1. **Reads become queries** — `kernel.dev.file.get`, `kernel.dev.files.list`, `builder.file.get`, `builder.dir.list`; writes and deletes stay commands.
2. Only `kernel.dev.file.list` becomes a query; the other reads stay commands and `11` §11.4's sentence changes.

## Decision

Option 1:

| Before | After | Kind |
|---|---|---|
| `kernel.dev.file.read` | `kernel.dev.file.get {project, path}` → file content | query (admin) |
| `kernel.dev.file.list` | `kernel.dev.files.list {project, path}` → `[{ path, size }]` | query (admin) |
| `kernel.dev.file.write` / `.delete` | unchanged | command (admin) |
| `builder.file.read` | `builder.file.get` | query (agent tool) |
| `builder.dir.read` | `builder.dir.list` | query (agent tool) |
| `builder.file.write` | unchanged | command (agent tool) |

## Consequences

Corrected: `03` §3.8, `11` §11.4, §11.5, §11.10, `13` §13.8, `15` M6.1.
