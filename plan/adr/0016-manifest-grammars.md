# ADR 0016 — Durations, private names, lane templates, naming exceptions

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner (confirmed after the implementer first stated it without asking)

## Question

The manifest needs grammars the plan does not spell out: durations (`retention: '7d'`, `every: '1h'`), private names (collections `files`, `childRuns`; log families `history:*`; schedules `prune`), the exact lane-template syntax (`02` §2.6), and how "an extension can declare exceptions with a reason" to the naming grammar (`02` §2.4).

## Decision

- **Duration**: a positive integer followed by `s`, `m`, `h`, or `d` (`30s`, `1h`, `7d`).
- **Private names**: `^[a-z][a-zA-Z0-9-]*$`; a log family may end in `:*` (`history:*`).
- **Lane template**: text with `{{ <path> }}` placeholders (spaces allowed inside the braces); paths are `$payload.<field>[.<field>…]`, `$context.<key>`, `$message.id`, `$message.source`, `$message.workspaceId`; at least one placeholder, because a template without one always fails admission (every path missing, `02` §2.6).
- **Cron** is recorded as a string; its syntax is checked when schedules are built (M2.7).
- **Naming exception**: an optional `namingException: '<reason>'` on `CommandDef`, `QueryDef`, and `EventDef`, recorded on the manifest's type entry; the grammar check then reports that name as a warning `excepted: <reason>` that never becomes an error.

## Consequences

`02` §2.4, §2.6 and `05` §5.3, §5.5 state these rules.
