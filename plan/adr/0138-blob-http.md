# ADR 0138 — Blob HTTP endpoints

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.5
- **Decided by**: the product owner

## Question

`12` §12.2 names `PUT /blobs` with the headers `Content-Type`, `X-Kvman-Filename`, and `X-Kvman-Workspace`, and `GET /blobs/:id?download=1`, but not which headers are required, how the name is encoded, what an unknown blob answers, or how `13` §13.7's "verified by content sniffing" works.

## Options

- **Headers and status:** 1. **lenient headers, 404 `BLOB_NOT_FOUND`**; 2. strict headers; 3. 404 `NOT_FOUND`.
- **Sniffing:** 1. **the declared mime and the bytes must agree**; 2. the bytes decide.

## Decision

Option 1 in both cases.

- `PUT /blobs`: a missing `Content-Type` means `application/octet-stream`. `X-Kvman-Filename` is optional, percent-encoded UTF-8, 1–255 characters. `X-Kvman-Workspace` is optional; an unknown workspace fails `WORKSPACE_INVALID`. The upload reference (owner `user`, ref `upload`, 24 h) is in that workspace, else in global scope. Over 100 MB fails 413 `BLOB_TOO_LARGE`.
- `GET /blobs/:id` of an unknown blob answers 404 `BLOB_NOT_FOUND` (ADR 0094's 404 row adds it).
- A blob is served inline only when its stored mime is on the allowlist and its bytes match it: the PNG, JPEG, GIF, and WebP signatures, and for `text/plain` valid UTF-8 with no NUL byte (sent as `text/plain; charset=utf-8`). Everything else, and every `?download=1`, is `Content-Disposition: attachment` with the name in `filename*`, served as `application/octet-stream`.

## Consequences

`12` §12.2 and `13` §13.7 are corrected.
