# ADR 0076 — Host frames, bad frames, closed contexts, event inputs

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

`03` §3.5 sketches the host protocol, but M1.6 needs more data in it: the workspace, the recorded values to replay (ADR 0070), and the module to load (ADR 0071). The kernel cannot import zod, so the frame schemas must live in `@kvman/protocol`. The plan also does not say what an invalid frame does, what a `ctx` call after the handler settled does, or how the host checks event payloads of foreign events (ADR 0074).

## Options

1. **Extend the listed frames**; 2. keep them and add `load`, `loaded`, `record` frames.
And: a bad frame is a worker loss, or fails one invocation. Late `ctx` calls throw `INTERNAL`, or pass until M1.7. Event deliveries parsed for own events only, or never.

## Decision

- Frames are Zod schemas in `@kvman/protocol`:
  - `invoke { invocationId, extension, handler, kind, message, readOnly, workspace?: { id, path, name }, recorded: { id: string[], now: number[] }, module?: { entry, manifest } }`. `module` is sent on a worker's first invocation of an extension. `deadlineAt` waits for M1.7.
  - `rpc { invocationId, callId, call }`, where `call` is one of `command { type, payload, options, ordinal, recorded }`, `query { type, payload }`, `live { type, key, chunk }`, `step.begin { name, retrySafe, recorded }`, `step.end { name, result? }`, or `log { level, message, fields? }`.
  - `rpcResult { invocationId, callId, result: { ok: true, value? } | { ok: false, problem } }`.
  - `complete { invocationId, outcome: { ok: true, value } | { ok: false, problem } | { deferred: true, onAbort? }, unitOfWork: { writes, sends, publishes, replies }, recorded }`.
  - `blobRefs` waits for M2.5, `abort` for M1.7, and `store.read` for M2.4.
- A frame from a host that fails validation is treated as that worker's loss (ADR 0067): the kernel stops the worker, fails its running attempts as retryable `INTERNAL` after resetting their live events, and replaces it on the next need. The log names the issue path, never the frame's content.
- Once a handler settles, its `ctx` is closed: every later call throws `INTERNAL` ("the invocation has ended") in the host, and an `rpc` for an ended invocation is answered with the same problem.
- The host parses a delivery of the extension's own event with its registered Zod payload schema; a foreign or `kernel.*` event relies on the kernel's JSON Schema check at publish.

## Consequences

`03` §3.5 and `05` §5.12 are corrected; `@kvman/protocol` gets a changeset.
