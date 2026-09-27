# ADR 0140 — Job tokens and kernel.sock

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.6
- **Decided by**: the product owner

## Question

`03` §3.7 and `12` §12.4 leave these open:

- when a token's allowed set is computed;
- what `delegate: true` gives when a person sent the current message;
- the correlation, causation, workspace, deadline, and locale of what a `kv` call sends;
- how `kv help` learns the allowed types, since the frame has only `op: 'command' | 'query'`;
- which code a bad token gets;
- what happens to a socket path over the operating system's limit.

`01` also calls `kernel.sock` a "CLI fallback", yet the CLI uses HTTP.

## Options

- **Allowed set:**
  1. **Re-evaluated on each call; a person delegates access-`all` types.**
  2. A snapshot at spawn.
  3. `delegate` only from an extension.
- **kv messages:**
  1. **Chained under the spawning message.**
  2. A new root per call.
  3. Chained, with the deadline inherited.
- **Help:**
  1. **A socket op `help`, rendered by the kernel; no CLI fallback.**
  2. Through `kernel.schema.get`.
- **Bad token:**
  1. **`CAPABILITY_DENIED`.**
  2. `CALLER_NOT_ALLOWED`.
  3. A new `TOKEN_INVALID`.
- **Socket path:**
  1. **Refuse to start.**
  2. Fall back to a temporary path.
  3. Always use a temporary path.

## Decision

Option 1 in every case.

**Tokens**

- A token is 32 random bytes (base64url). It lives only in the kernel's memory, keyed by its SHA-256, and is revoked when its process ends. A restart kills every process, so none survives one.
- On every call the kernel resolves the token to `proc:<processId>`. Then:
  - The type must match a `token.calls` pattern, else `CAPABILITY_DENIED`.
  - Access `user` and `internal` are refused `CALLER_NOT_ALLOWED` (`12` §12.4).
  - The type must be one the token's actor may send under the current registry and grants, checked at admission.
- **The actor:**
  - Without `delegate`, the actor is the spawner.
  - With `delegate: true`, it is the source of the message whose handler spawned the process, fixed at spawn:
    - an extension: its own types, its granted `calls`, and its granted `tools`;
    - a person: only access-`all` types;
    - a process: that process's own actor, if its token is still live, else nothing;
    - the kernel (a schedule, a timer, an `onExit`): the spawner, as without `delegate`.
- An unknown, revoked, or missing token is refused `CAPABILITY_DENIED` with the detail "the job token is not valid", which does not say which case it was.

**What a call sends.** A `kv` command or query is sent as `proc:<processId>`, with:

- the spawning message's workspace and `correlationId`;
- `causationId` set to the spawning message's id;
- context set to the spawning message's context overlaid with `token.context`. The locale is inherited and cannot be changed.
- priority `normal` (`02` §2.6);
- no inherited deadline.

It appears in the spawner's trace.

**`kernel.sock`**

- The socket is `<home>/kernel.sock`, 0600, and speaks newline-delimited JSON, one request per connection.
- A stale file is removed at boot (the lock is held), and the socket is deleted at shutdown.
- If the path is longer than 103 bytes, the daemon refuses to start with `HOME_INVALID` and a hint to use a shorter home path.
- A request is at most 17 MB (the 16 MB payload plus its envelope). One larger, or one that does not parse, is answered with a problem and the connection ends.
- There is no token-less CLI fallback: the CLI keeps HTTP.

**Frames**

- **Requests:**
  - `{ token, op: 'command', type, payload, idempotencyKey?, wait? }`
  - `{ token, op: 'query', type, payload }`
  - `{ token, op: 'help', type? }`
- **Answers:** `{ ok: true, data }` or `{ ok: false, problem }`.
- **Commands** wait for their reply as over HTTP: `wait` in ms, default and maximum 60 s (`12` §12.2). `data` is the reply value. A failed reply answers its problem. A deferred reply, or one slower than `wait` (including `wait: 0`), answers `data: { id, state }`.
- **`help`** answers:
  - without `type`: `{ types: [{ type, kind, description }] }`, the types the token may call right now, sorted by type;
  - with `type`: `{ type, kind, description, input, output?, markdown }`, where `markdown` is the kernel-rendered help of `12` §12.6.

  A type the token may not call answers the problem a call of it would: `CALLER_NOT_ALLOWED` for access `user` or `internal`, checked first, otherwise `CAPABILITY_DENIED`.

## Consequences

- `01` drops "CLI fallback" from `kernel.sock`.
- `12` §12.4 gains the `help` op, the answers, and the path rule.
- `13` §13.2 notes that a bad token is `CAPABILITY_DENIED`.
- `03` §3.7's token paragraph says the set is re-evaluated on each call.
- `02` §2.6 already gives process-token messages `normal` priority; the kernel now applies it even when the spawning chain is interactive.
