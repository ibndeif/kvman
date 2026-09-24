# ADR 0056 — Ajv configuration

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.4
- **Decided by**: the product owner

## Question

Manifest JSON Schemas carry annotation keywords from `.meta()` (`label`, `help`, `secret`, `ui`, or any author key) and formats (`kvman-blob-id`, `email`, `uri`, …), which Ajv's strict mode refuses.

## Options

1. **Spec mode without a formats package.**
2. The same plus `ajv-formats`.

## Decision

Option 1: Ajv `8.20.0` (D55) for draft 2020-12 with `allErrors` and `strict: false`, so unknown keywords are annotations as the JSON Schema specification says. The formats `kvman-blob-id`, `kvman-text`, and `kvman-action` are registered (the blob id is checked by its pattern); other formats are not checked by Ajv, but Zod also writes a `pattern` for `email`, `uuid`, and `date-time`, and the host re-checks the full Zod schema (`05` §5.12). Validators are compiled once per type entry.

## Consequences

`03` §3.3 step 5 states the configuration.
