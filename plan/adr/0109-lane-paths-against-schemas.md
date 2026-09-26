# ADR 0109 — Lane paths checked against schemas

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

`06` §6.3 and `02` §2.6 say a lane's `$payload` paths must exist in the input schema. The plan leaves three things open:

- how a subscription lane is checked, since a foreign event's payload is known only when its owner is enabled;
- what "exists" means through unions, records, intersections, and `$ref`s;
- what counts for a schema that accepts any value.

## Options

For subscriptions:

1. **Own and kernel events at install, foreign events at enable.**
2. **Syntax only** for subscription lanes.
3. **Own and kernel events only**, foreign ones never.

For paths:

1. **Declared in some branch.**
2. **Plain properties only.**
3. **Declared, and the path ends at a string or number schema.**

## Decision

Option 1 for both questions.

**Which lanes are checked, and against what:**

- A command's `lane` is checked against its `input`.
- A subscription's `lane` is checked against the payload of the event it names, when that event is:
  - one of the extension's own events: its `payload`, and an event without one declares no field;
  - a `kernel.*` event: the payload schema in the kernel's types.
- A foreign event's lane is checked when its owner is enabled (M2.3, referential).
- A subscription with a `<prefix>.*` pattern is never checked.

**When a path `$payload.a.b` exists.** A schema declares the next key when any of these holds:

- it lists the key in `properties`;
- a `$ref` into `$defs` does, after resolving it;
- any branch of `anyOf`, `oneOf`, or `allOf` does;
- `additionalProperties` is a schema (a record or a loose object): any key is accepted there.

A schema that accepts any value (`{}` or `true`) accepts the rest of the path.

**The failure.** It is an error at `types.<i>.lane` or `subscriptions.<i>.lane`: `"$payload.<path>" is not a field of the <input | event payload>`. The hint lists the fields declared where the path stops (`fields there: fileId, lang`).

**Syntax failures.** A bad placeholder, unbalanced braces, or no placeholder is an error at the same path, with the hint `write placeholders as {{ $payload.<field> }}, {{ $context.<key> }}, or {{ $message.id }}`.

## Consequences

`02` §2.6 and `06` §6.3 name the rule. M2.3 adds the foreign-event check at enable.
