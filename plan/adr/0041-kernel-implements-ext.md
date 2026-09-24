# ADR 0041 — The kernel implements the recording `ext`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.3
- **Decided by**: the product owner

## Question

`05` §5.1 says the kernel records the manifest by running `setup` with a recording `ext`, and hosts run `setup` again to bind functions. The import walls allow the kernel only the types of `@kvman/sdk`. Which package implements `ext`?

## Options

1. **The kernel implements `ext`**, as it implements `Store`; the SDK holds `defineExtension`, the `Ext` types, and `z`.
2. The SDK implements it and exports a public `recordExtension`; loader and hosts would then need SDK runtime code outside the kernel.

## Decision

Option 1:

- `defineExtension(meta, setup)` (SDK) returns a frozen `{ meta, setup }`, the extension's default export.
- The kernel's recorder runs `setup` with an `ext` that implements the SDK's `Ext` interface and returns the manifest and the registered functions keyed by their references (`command:pdf.translate` …). The M2.2 loader and the M1.6 hosts use this recorder.
- Tests that write an extension with `defineExtension` and record it with the kernel live in `packages/testkit/test/`, the one package allowed to import both.

## Consequences

`05` §5.1 says which package implements `ext`.
