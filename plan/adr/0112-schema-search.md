# ADR 0112 — How `/schema` ranks a text search

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

`12` §12.7: "`q` does a ranked text search over names and descriptions". The plan gives neither the matching rule nor the ranking.

## Options

1. **Every word matches; score by name first.**
2. **Any word matches**, with the same scores.
3. **One substring, no ranking.**

## Decision

Option 1.

**Matching.** `q` is split on whitespace into lowercase words. An entry matches when every word appears (case-insensitive substring) in its name or its description.

**Names:**

| List | Name |
|---|---|
| `types`, `entities` | `type` |
| `errors` | `code` |
| `extensions` | `name` |

**Score:**

| Condition | Points |
|---|---|
| The name equals `q` (case-insensitive) | 100 |
| The name starts with `q` | 50 |
| Each word found in the name | 10 |
| Each word found in the description | 1 |

**Result:**

- `types`, `entities`, `errors`, and `extensions` keep only matching entries, sorted by score (highest first), then by name.
- Without `q`, each of these lists is sorted by name.
- `components`, `frameSlots`, `contributions`, and `contracts` are not filtered by `q`.
- A blank `q` is refused by the payload schema (`q` has at least one non-space character).

## Consequences

`12` §12.7 states the rule.
