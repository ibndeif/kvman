# ADR 0134 — Blob metadata, read rights, and GC

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.5
- **Decided by**: the product owner

## Question

`04` §4.6 stores blobs by content, but the `blobs` table has `mime` and no `name`, while `blobs.stat` returns `{ size, mime, name? }` and `PUT /blobs` answers `name`. It says an extension may read a blob it "holds a ref to" or that "arrived in a `z.blobId()` field of the message it is handling (payload or reply)" without saying which scopes and which replies count, and it checks only admitted payloads. It calls GC "a kernel background job" without a schedule, and it does not name the codes of the 16 MB read limit (`04` §4.3).

## Options

- **Metadata:** 1. **the first put wins**; 2. per reference; 3. the last put wins.
- **Read rights:** 1. **a reference in any scope, plus blob IDs received in the message, a `ctx.command` reply, or a `ctx.query` result**; 2. a reference in the invocation's workspace or global scope only; 3. query results hand nothing over.
- **Replies:** 1. **checked like payloads**; 2. not checked.
- **GC:** 1. **at boot, then every 10 minutes**; 2. hourly; 3. a kernel option.
- **Limit codes:** 1. **`BLOB_TOO_LARGE` for blob reads and puts**; 2. `PAYLOAD_TOO_LARGE` for reads.

## Decision

Option 1 in every case.

- **Metadata.** The `blobs` row keeps the mime and name of the first put of those bytes (kernel schema 3 adds `blobs.name`). A later put of the same bytes answers what is stored. A put without a mime stores `text/plain` for a string and `application/octet-stream` for anything else.
- **Read rights.** An extension may read a blob when it holds a reference to it in any scope (a workspace, or global), a pending one from its own put included, or when the blob ID arrived during the invocation in a `z.blobId()` field of the message it is handling (a continuation's reply is part of its payload), of a `ctx.command` reply, or of a `ctx.query` result. People and the kernel read every blob. For an extension, a blob that does not exist is refused like one it may not read (`CAPABILITY_DENIED`), so a refusal tells nothing about other extensions' blobs.
- **Replies.** Every `z.blobId()` field of a command result, a deferred `ctx.reply`, or a query result must be readable by the handler that returns it. Otherwise the invocation fails `CAPABILITY_DENIED` (not retryable): a command at commit, a query before its result is returned.
- **GC** runs at boot and then every 10 minutes on the kernel clock, in bounded batches, each a synchronous single-writer step. A run deletes expired references (uploads past 24 h, pending references past their invocation deadline plus 1 h), then the `blobs` rows without a reference that are more than 1 h old, and unlinks their files.
- **Limits.** `blobs.text` and `blobs.bytes` of a blob over 16 MB fail `BLOB_TOO_LARGE { max: 16777216 }` with a hint to use `stream`; a put over 100 MB fails `BLOB_TOO_LARGE { max: 104857600 }`.

## Consequences

`04` §4.1 (DDL), §4.2 (the unit of work's `blobRefs` carry `{ blobId, scope, op: 'keep' | 'release' }`; the owner and the ref `blob:<id>` come from the invocation), §4.3 (Blobs), and §4.6 are corrected; `13` §13.2 names the params.
