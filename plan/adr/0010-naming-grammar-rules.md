# ADR 0010 — Exact naming-grammar checks

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

`02` §2.4 defines the grammar per kind and documents one hint (for an event). M0.2 must "reject `pdf.translated` as a command with the documented hint", but the command hint is not documented, and the plan does not say which word of a multi-word segment (`set-model`, `dead-lettered`) is checked, nor how words whose participle equals their base form (`set`, `read`) or that end in `-eed` (`seed`) are treated.

## Options

1. **As proposed** — commands check the first word of the last segment, events the last word; base-form-equal participles count as verbs; hints with a "did you mean" suggestion from simple English inflection.
2. The same checks with hints that only describe the rule (no suggestion).

## Decision

Option 1:

- *Format* (always an error): at least two segments; each lowercase kebab-case; the namespace 2–32 characters.
- *Query*: the last segment is exactly `get`, `list`, `search`, `count`, `preview`, or `validate`. Hint: `query names end in a read verb (get, list, search, count, preview, validate)`.
- *Event*: the last word of the last segment ends in `-ed` or is in the built-in irregular-participle list. Hint: `event names end in a past participle: did you mean "<suggestion>"?`.
- *Command*: the first word of the last segment is neither a read verb nor a past participle; words whose participle equals their base (`set`, `read`, `run`, `put`, `cut`, `reset`, …) count as verbs; `-eed` words and `embed`, `shred` are not `-ed` forms. Hint: `command names end in an imperative verb: did you mean "<suggestion>"?`.
- A finding has a `message` (the rule) and a `hint` (the suggestion); shown together they read as `02` §2.4 documents: `event names end in a past participle: did you mean "pdf.file.translated"?`.
- Suggestions inflect with `+d`, `+ed`, `-y → -ied` and the reverse; exact for the plan's examples, best effort otherwise.
- Grammar violations are warnings for installed extensions and errors for builder-generated ones (`02` §2.4): the checker labels each finding `format` or `grammar`, and its caller turns grammar findings into warnings or errors.

## Consequences

- `02` §2.4 states the exact checks.
- How an extension declares a grammar exception with a reason is a manifest question, decided with M0.3.
