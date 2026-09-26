# ADR 0106 — Which schema fields need a description

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

Two sections disagree about which fields need a description:

- `00` global rule 5 names "types, entities, components, contributions, and config fields";
- `06` §6.3 says "every field and type has a description".

The plan's own pdf example (`05` §5.2) has input fields and collection fields with no `.describe()`.

## Options

1. **Config fields only.** `00` wins, and the pdf example stays valid.
2. **Every field of every schema:** inputs, outputs, payloads, collections, entities, and config.
3. **The fields callers fill** (inputs and payloads) plus config fields.

## Decision

Option 1.

- Every property of the `registerConfig` schema needs a description, at every depth: nested object properties and the properties of array items. A blank description counts as missing.
- A missing one is an error at `config.schema.properties.<field>…`, with the hint `add .describe('…') to the field "<field>"`.
- Other schemas' fields are not checked.
- Types, entities, errors, collections, logs, schedules, and subscriptions keep their required `description` (the manifest schema).

## Consequences

- `06` §6.3 is corrected to follow `00` rule 5.
- The structural validator walks config schemas.
