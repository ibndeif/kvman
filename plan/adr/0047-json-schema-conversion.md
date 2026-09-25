# ADR 0047 — Converting Zod schemas to JSON Schema

- **Status**: accepted; amended by ADR 0077 (inputs in the input view)
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

The kernel's recorder (ADR 0041) converts each registered Zod schema to JSON Schema, but the kernel may import only protocol.

## Options

1. **A protocol helper**: one pure function that converts a schema and reports what cannot be represented.
2. The kernel depends on `zod` directly.

## Decision

Option 1: `@kvman/protocol` exports the conversion (Zod 4's `z.toJSONSchema` with its default options, draft 2020-12, as the M0.3 fixture was made). A schema that cannot be represented (transforms, custom types) is reported as an issue at the registration's manifest path instead of an exception.

## Consequences

`05` §5.12 names where the conversion lives.
