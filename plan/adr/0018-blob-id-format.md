# ADR 0018 — Blob id format and its JSON Schema marker

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner

## Question

A field typed `z.blobId()` grants read access to the blob it names (`04` §4.6), so the kernel must find such fields in a manifest's JSON Schema at admission. The plan defines neither how `z.blobId()` is written in JSON Schema nor what a blob id looks like (`05` §5.2 only shows `'sha256…'`).

## Options

1. **`format: "kvman-blob-id"` and lowercase SHA-256 hex ids.**
2. The same marker with `sha256:<hex>` ids.
3. A custom keyword `kvmanBlobId: true` with hex ids.

## Decision

Option 1. A blob id is the lowercase hex SHA-256 of the blob's bytes (its content address, `blobs/ab/cd/<sha256>`). `z.blobId()` converts to `{ "type": "string", "format": "kvman-blob-id", "pattern": "^[0-9a-f]{64}$" }`, and the kernel's Ajv instance registers the `kvman-blob-id` format.

## Consequences

`04` §4.6 and `05` §5.3 state the format; `@kvman/protocol` exports the blob id schema.
