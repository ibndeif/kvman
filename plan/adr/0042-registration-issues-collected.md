# ADR 0042 — Registration mistakes are collected and reported once

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

`05` §5.3 says a public name without the namespace, and a duplicate in a name set, fail validation with `EXT_MANIFEST_INVALID`, and that `ext` throws after `setup` returns. It does not say whether each `register*` call fails at once or the recording fails as a whole.

## Options

1. **Collect, fail once**: record everything, validate the whole manifest, and fail with every issue.
2. Throw at the first bad call.

## Decision

Option 1:

- The recorder builds the whole manifest, then checks it with the protocol's manifest schema, the namespace rule for public names and error codes, the name sets, and the migration steps (ADR 0046). A schema that cannot become JSON Schema is an issue too (ADR 0047). The rest of `06` §6.3's structural validation (reserved namespaces, lossless conversion, lane paths, naming grammar, the size limit) is M2.1's.
- It fails once with `EXT_MANIFEST_INVALID`, whose `issues` list every mistake at its manifest path (`types.3.type`) with a hint where one helps (`did you mean "pdf.translate"?`).
- `setup` that returns a promise fails the same way (`setup` is synchronous), and so does a `setup` that throws, with the detail `setup threw: <message>` (the product owner's answer to a follow-up question).
- Calling `ext` after `setup` returns throws `EXT_MANIFEST_INVALID` at once, with the detail `ext is closed after setup returns`.

## Consequences

`05` §5.3 states how registration mistakes are reported.
