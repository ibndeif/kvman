# ADR 0110 — What `kernel.validate` accepts in M2.1

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.1
- **Decided by**: the product owner

## Question

`03` §3.8 gives `kernel.validate` the payload `{ workspaceId?, manifest? | preset? | page? | catalog? }`. M2.1 builds structural validation only:

- referential checks need enable (M2.3);
- catalog checks need the ICU parser that comes with `registerTranslations`.

Which inputs does M2.1 accept?

## Options

1. **Manifest, preset, and page.** `catalog` and `workspaceId` are refused with a hint.
2. **Manifest only.**
3. **The full shape**, silently ignoring what is not built.

## Decision

Option 1.

- The payload is exactly one of `manifest`, `preset`, `page`, or `catalog`, with an optional `workspaceId` (a union in `@kvman/protocol`).
- **`manifest`**: every structural rule of `06` §6.3 that reads the manifest. Its UI sections are checked only against their protocol shapes, and M2.10 adds the UI rules. The rules that need `setup` itself (synchronous, deterministic, `ext` closed) are checked where the manifest is recorded.
- **`preset`**: the preset schema. Once it parses, also the secret check (ADR 0017) against the config schemas of the installed extensions.
- **`page`**: a page definition (`pageDefSchema`, its view checked by the structural view validator).
- **`catalog`**: refused with `VALIDATION_FAILED` at path `catalog`, hint `validate a manifest, preset, or page`.
- **`workspaceId`**: refused with `VALIDATION_FAILED` at path `workspaceId`, hint `omit workspaceId to run the structural checks`.
- **The result** is `{ ok, issues }`, where `ok` is false exactly when some issue is an error (ADR 0011). A payload that is not one of these shapes is `VALIDATION_FAILED` at admission.

## Consequences

- `@kvman/protocol` gains `validateRequestSchema` and `validateResultSchema`.
- `03` §3.8's row notes what M2.1 accepts.
- M2.3 adds `workspaceId`, and M2.11 (which builds `registerTranslations` and catalog validation) adds `catalog`.
