# ADR 0008 — Filter language semantics

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

`04` §4.3 lists the filter operators (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `prefix`, `exists`, `$or`), which `08` §8.7 reuses for UI conditions, but it does not define missing fields, `null`, type mismatches, nested paths, or `in` on array fields (the example `tags: { in: ['a','b'] }` reads either way). The same filter runs three times and must agree: as SQL over committed documents, in the read-your-writes overlay (`04` §4.3 "What reads see"), and in the shell's conditions.

## Options

1. **As proposed** — missing ≡ `null`; `ne` is the negation of `eq`; comparisons only between two numbers or two strings (code-point order); `in` looks inside array fields; dotted paths.
2. As proposed, but `ne` requires the field to exist (SQL `!=`).
3. As proposed, but `in` never looks inside array fields.

## Decision

Option 1:

- Keys at one level are ANDed; `{}` matches everything. A key is a field name or a dotted path into nested objects and arrays (`meta.size`, `items.0.id`). A missing field and a JSON `null` are the same.
- A scalar value means `eq`. A plain object value is always an operator object (several operators are ANDed; an unknown operator is invalid). Operands are JSON scalars; `eq` on objects or arrays is not supported.
- `eq`: strict equality of JSON scalars; `eq: null` matches a missing or `null` field. `ne`: exactly the negation of `eq`.
- `gt`, `gte`, `lt`, `lte`: true only when field and operand are both numbers, or both strings compared by Unicode code point (SQLite `BINARY` order on UTF-8); otherwise false.
- `in`: a scalar field matches when it equals any element; an array field matches when any of its elements equals any element.
- `prefix`: a string field that starts with the operand (case-sensitive); otherwise false.
- `exists: true`: present and not `null`; `exists: false`: missing or `null`.
- `$or`: true when any alternative matches; `[]` matches nothing; `$or` may nest.

## Consequences

- `@kvman/protocol` exports the filter schema and one evaluator with these rules; M1.2 translates the same rules to SQL and tests both against one table.
- `04` §4.3 states these semantics.
