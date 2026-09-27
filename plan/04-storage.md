# 04 — Storage

## 4.1 Physical layout

One SQLite database `~/.kvman/kvman.db` in WAL mode with `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000` (ADR 0032). File mode 0600. Blobs live beside it as files. Secrets live in `~/.kvman/secrets.json` (0600) and never enter the database.

Driver: `better-sqlite3` (R-Q1). The storage engine hides the driver behind one interface so it can be replaced (e.g. by `node:sqlite` once stable) with one adapter and an ADR.

**Who touches the file**: the kernel main thread is the only writer (the commit pipeline, §4.2). Shared and dedicated hosts read through their own read-only connections. Sandboxed hosts never load the driver: their reads go by RPC to the kernel's **read pool**, 2 worker threads (the kernel option `readPoolSize`, ADR 0131) with read-only connections, so a large read never runs on the main thread.

### Kernel tables (abridged DDL)

```sql
-- durable deliveries: commands (continuations are commands) and durable event deliveries
CREATE TABLE messages (
  seq INTEGER PRIMARY KEY,             -- monotonic
  id TEXT NOT NULL UNIQUE,             -- ULID
  kind TEXT NOT NULL,                  -- command | event
  type TEXT NOT NULL,
  source TEXT NOT NULL, target TEXT,
  handler TEXT NOT NULL,               -- extension; '<extension>|subscription:<pattern>' for event deliveries
                                       -- (ADR 0053); '' for a send that failed
                                       -- admission because its type is unknown (ADR 0034)
  workspace_id TEXT, lane TEXT,        -- extension + '|' + rendered lane template
  payload TEXT, payload_ref TEXT,
  context TEXT NOT NULL,
  state TEXT NOT NULL,                 -- pending|running|awaiting|done|failed|dead|cancelled
  priority INTEGER NOT NULL,           -- interactive 0, normal 1, background 2 (ADR 0032)
  attempts INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER, deadline_at INTEGER,
  correlation_id TEXT NOT NULL, causation_id TEXT,
  on_reply TEXT,                       -- continuation to send when this command's result is written
  on_abort TEXT,                       -- defer({ onAbort }): internal command sent if it ends without a reply
                                       -- (kernel schema 2, ADR 0070)
  idempotency_source TEXT, idempotency_key TEXT, digest TEXT,
  result TEXT, result_ref TEXT,        -- ReplyPayload for commands; over 256 KB it spills to a blob (result_ref)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, retain_until INTEGER
);
CREATE UNIQUE INDEX messages_idem ON messages(idempotency_source, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX messages_runnable ON messages(state, priority, not_before);
CREATE INDEX messages_correlation ON messages(correlation_id);

-- log of published durable events (client resume, inspector)
CREATE TABLE events (seq INTEGER PRIMARY KEY, id TEXT UNIQUE, type TEXT, source TEXT,
  workspace_id TEXT, payload TEXT, correlation_id TEXT, causation_id TEXT, created_at INTEGER,
  payload_ref TEXT);                   -- a payload over 256 KB spills to a blob (kernel schema 3, ADR 0135)

CREATE TABLE steps (message_id TEXT, name TEXT, state TEXT, result TEXT,
  retry_safe INTEGER, started_at INTEGER, finished_at INTEGER, PRIMARY KEY(message_id, name));

-- ctx.ids.new() and ctx.now() values in call order, replayed on redelivery (kernel schema 2, ADR 0070)
CREATE TABLE recorded_values (message_id TEXT, kind TEXT /* 'id' | 'now' */, n INTEGER, value TEXT,
  PRIMARY KEY(message_id, kind, n));

CREATE TABLE processes (id TEXT PRIMARY KEY, message_id TEXT, extension TEXT, pid INTEGER,
  pgid INTEGER, process_start TEXT, state TEXT, log_path TEXT, log_blob TEXT, exit_code INTEGER,
  started_at INTEGER, ended_at INTEGER,
  -- kernel schema 4 (ADR 0139): what boot reconciliation needs to send onExit; spawned_by is the
  -- spawning message's envelope without its payload
  ws TEXT, command TEXT, detached INTEGER NOT NULL DEFAULT 0, on_exit TEXT, signal TEXT, reason TEXT,
  truncated INTEGER NOT NULL DEFAULT 0, spawned_by TEXT);

-- extension storage
CREATE TABLE kv   (owner TEXT, ws TEXT, key TEXT, value TEXT, version INTEGER, updated_at INTEGER,
                   PRIMARY KEY(owner, ws, key));
CREATE TABLE docs (owner TEXT, ws TEXT, collection TEXT, id TEXT, data TEXT, version INTEGER,
                   created_at INTEGER, updated_at INTEGER, PRIMARY KEY(owner, ws, collection, id));
CREATE TABLE logs (owner TEXT, ws TEXT, log TEXT, seq INTEGER, data TEXT, at INTEGER,
                   PRIMARY KEY(owner, ws, log, seq));
CREATE TABLE blobs (id TEXT PRIMARY KEY, size INTEGER, mime TEXT, created_at INTEGER,
                   name TEXT);         -- mime and name of the first put (kernel schema 3, ADR 0134)
CREATE TABLE blob_refs (blob_id TEXT, owner TEXT, ws TEXT, ref TEXT, expires_at INTEGER,  -- ref 'pending:<messageId>' while
                   PRIMARY KEY(blob_id, owner, ws, ref));                                  -- a handler that put it runs (§4.6)

-- platform
CREATE TABLE extensions (name TEXT PRIMARY KEY, namespace TEXT, active_digest TEXT,
                   pending_digest TEXT,               -- an upgrade waiting for grants (06 §6.6)
                   migrating TEXT,                    -- { digest, grants? }: data migration in progress (§4.8)
                   status TEXT,                       -- active | quarantined (needs-approval is derived from pending_digest)
                   quarantine_reason TEXT,            -- HOST_FAILURES | EXT_INTEGRITY | MIGRATION_FAILED (03 §3.6)
                   installed_at INTEGER);             -- isolation is granted per workspace, in the applied preset
CREATE TABLE extension_versions (name TEXT, digest TEXT, source TEXT, integrity TEXT, -- 07 §7.4 "Versions"
                   manifest TEXT, data_schema INTEGER, installed_at INTEGER, PRIMARY KEY(name, digest));
CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT UNIQUE, name TEXT, kind TEXT NOT NULL DEFAULT 'normal', -- normal|preview
                   trust TEXT, created_at INTEGER);   -- trust: { mode: once|always, files: [{path, sha256}] } | NULL
CREATE TABLE workspace_presets (workspace_id TEXT PRIMARY KEY, preset TEXT, revision INTEGER, applied_at INTEGER);
                                                     -- preset: the applied copy without `config` (below)
CREATE TABLE workspace_config (workspace_id TEXT, extension TEXT, value TEXT, revision INTEGER, updated_at INTEGER,
                   PRIMARY KEY(workspace_id, extension));   -- workspace-scope config, validated against the schema (§4.7)
CREATE TABLE presets (id TEXT PRIMARY KEY, doc TEXT, builtin INTEGER NOT NULL DEFAULT 0, revision INTEGER, updated_at INTEGER);
CREATE TABLE global_config (extension TEXT PRIMARY KEY, value TEXT, revision INTEGER);  -- validated against the schema (§4.8)
CREATE TABLE schema_versions (owner TEXT PRIMARY KEY, version INTEGER);   -- data schema versions: 'kernel' and each extension
CREATE TABLE kernel_settings (key TEXT PRIMARY KEY, value TEXT, revision INTEGER, updated_at INTEGER); -- e.g. llm.defaults, kvman.version (03 §3.9)
CREATE TABLE notifications (id TEXT PRIMARY KEY, ws TEXT, source TEXT, key TEXT,  -- 08 §8.11
                   level TEXT, data TEXT, attention INTEGER, read_at INTEGER, dismissed_at INTEGER,
                   expires_at INTEGER, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX notifications_key ON notifications(source, ws, key) WHERE key IS NOT NULL;
CREATE TABLE user_preferences (user_id TEXT PRIMARY KEY, data TEXT,
                   -- { locale, theme: app|system|light|dark, desktopAlerts, muted: { [workspaceId]: extension[] } } (08 §8.16)
                   revision INTEGER, updated_at INTEGER);

-- LLM service (03 §3.12)
CREATE TABLE llm_models (provider TEXT, id TEXT, extension TEXT, info TEXT, source TEXT, -- static|listed
                   refreshed_at INTEGER, PRIMARY KEY(provider, id));
CREATE TABLE llm_usage (message_id TEXT PRIMARY KEY, ws TEXT, caller TEXT, provider TEXT, model TEXT,
                   input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER,
                   cost_usd REAL, correlation_id TEXT, at INTEGER);
```

`ws` is the workspace ID, or `''` for global scope. Extensions never see these tables; they use the store API.

## 4.2 Unit of work and the commit pipeline

During an invocation the SDK collects a **unit of work**:

```ts
type UnitOfWork = {
  writes: Array<KvWrite | DocWrite | LogAppend | LogTruncate>;  // each with expectedVersion when known
  sends: OutboundMessage[];      // commands (incl. continuations), delayed sends
  publishes: OutboundEvent[];    // durable + transient events
  replies: Array<{ commandId: string; payload: ReplyPayload }>; // ctx.reply for deferred commands
  blobRefs: Array<{ blobId: string; scope: StoreScope; op: 'keep' | 'release' }>;   // ref and owner from the invocation (ADR 0134)
  secrets: Array<{ name: string; value: string | null }>;        // ctx.secrets.set, applied after commit (§4.7)
  config: Array<{ scope: 'global' | 'workspace'; value: Json }>;  // ctx.config.set, applied in the commit (§4.7)
};
// the writes (ADR 0031); owner and workspace come from the invocation, never from the unit
type KvWrite = { kind: 'kv.set'; scope: StoreScope; key: string; value: Json; expectedVersion?: number }
             | { kind: 'kv.delete'; scope: StoreScope; key: string; expectedVersion?: number };
type DocWrite = { kind: 'doc.put'; scope: StoreScope; collection: string; id: string; data: JsonObject; expectedVersion?: number }
              | { kind: 'doc.delete'; scope: StoreScope; collection: string; id: string; expectedVersion?: number };
type LogAppend = { kind: 'log.append'; scope: StoreScope; log: string; seq: number; value: Json };
type LogTruncate = { kind: 'log.truncate-before'; scope: StoreScope; log: string; seq: number } | { kind: 'log.drop'; scope: StoreScope; log: string };
type StoreScope = 'workspace' | 'global';   // ws = '' for global
// expectedVersion: absent = blind write; 0 = the read found nothing (must still not exist); n = must still be n.
// Versions start at 1, +1 per write; a delete removes the row; a mismatch or a taken log seq = STORAGE_CONFLICT.
```

When the handler returns, the host sends `complete` with the unit of work. The kernel commit pipeline:

```
queue ─(end of the event-loop turn, or 64 units; ADR 0105)─▶ BEGIN IMMEDIATE
   for each unit:  SAVEPOINT u
                   check invocation still live (not cancelled, invocation deadline not passed) else ROLLBACK TO u
                     and end it as 02 §2.9 says (HANDLER_TIMEOUT or DEADLINE_EXCEEDED)
                   apply writes with version checks        ─ conflict → ROLLBACK TO u, mark STORAGE_CONFLICT
                   admit each send and publish (03 §3.3 steps 3–6; the unit's publishes are { type, payload }, ADR 0053):
                     a send WITH onReply that fails → insert it as a command already `failed` with that problem;
                                                       its continuation is delivered normally (the sender handles it)
                     any other failure → ROLLBACK TO u, fail the invocation with that problem (not retryable)
                   insert sends, event deliveries, events log rows, continuation for its own reply
                   apply deferred replies, blob refs, and config writes (each validated against the schema, else
                     ROLLBACK TO u and fail the invocation with CONFIG_INVALID, not retryable; each bumps its row's
                     revision and publishes kernel.config.changed); delete this invocation's pending blob refs (§4.6)
                   mark the invocation's message done|failed|awaiting (+ result)
                   RELEASE u
the batch's messages join the pending index; the scheduler claims the runnable ones (ADR 0105)
COMMIT (one fsync; the claims are dispatched after it)
after commit: apply secrets (§4.7), resolve waiters, push events and replies to the live bus, add new messages
              to the pending index
```

- **Read-your-writes**: inside the handler, every read sees the handler's own pending writes first (§4.3 "What reads see").
- **Versions are automatic**: the SDK remembers the version of every kv entry and document the handler read. A later write to the same key carries that version, so the commit fails with `STORAGE_CONFLICT` if someone else changed it in between; a write to a key the handler never read is a plain overwrite. On conflict the whole unit is discarded and the handler runs again at once (up to 5 times per attempt, not counted as attempts; the sixth conflict is a counted, retryable failure, ADR 0059). Lanes make conflicts rare.
- **Limits** per unit of work: 8 MB of writes, 1,000 messages. Larger work must be split; a unit over a limit fails with `PAYLOAD_TOO_LARGE` (params `{ limit, max }`, not retryable, ADR 0032).
- **Queries** never produce a unit of work; their store handle is read-only (writes throw `CAPABILITY_DENIED`).
- **Why a failed `send` with `onReply` does not fail the sender**: the sender already declared how it handles the result, so a target that is disabled or rejects the payload is just a failed result. This is how a tool whose extension was disabled mid-turn becomes a tool error in the agent's history instead of a stuck turn.

## 4.3 Store API (`ctx.store`)

Four primitives, one shape each. There is no pagination anywhere in kvman: reads return plain arrays, bounded by filters, `limit`, and a hard cap.

```ts
ctx.store.kv                       // small values by key
ctx.store.collection(name | ref)   // typed documents with indexes and filters
ctx.store.log(name | ref, key?)    // append-only sequences, numbered 1, 2, 3, …
ctx.store.blobs                    // bytes (files), stored once per content
ctx.store.global                   // the same four, in global scope instead of the current workspace
```

Every call is scoped to the invocation's workspace (a handler without a workspace, i.e. a `global`-scope type, may use only `ctx.store.global`; the workspace store throws `WORKSPACE_INVALID` there, ADR 0040). The owner is always the calling extension; an extension cannot name another extension's data. `collection(name)` must name a collection the extension registered, and `log(name)` must match a log prefix it registered (`registerLog('history:*')` covers `history:abc`); any other name throws `VALIDATION_FAILED` with a hint. With a log family's reference, `log(history, key)` is the log `history:<key>` (ADR 0044). kv keys need no registration.

### Key-value
```ts
const turn = await ctx.store.kv.get<TurnState>(`turn:${sessionId}`);   // value | undefined
ctx.store.kv.set(`turn:${sessionId}`, { ...turn, status: 'running' });  // buffered
ctx.store.kv.delete(`turn:${sessionId}`);                                 // buffered
const all = await ctx.store.kv.list('turn:');                             // Array<{ key, value }>, by key
```
Keys are strings up to 512 characters; values are JSON up to 1 MB (`kv.set` of a larger value throws `PAYLOAD_TOO_LARGE`, ADR 0039).

### Collections
Registered in `setup` (the schema validates every write; `idField` names the id field, default `'id'`):
```ts
const files = ext.registerCollection('files', {
  description: 'Imported PDF files.', schema: FileSchema, indexes: [['status', 'createdAt'], ['name']],
});
```
Used in handlers:
```ts
const col = ctx.store.collection(files);                  // or ctx.store.collection('files')
const f   = await col.get(id);                            // Doc | undefined
col.put({ id, name, status: 'ready', createdAt: ctx.now() });   // insert or replace (buffered)
const g   = await col.patch(id, { status: 'translated' });      // merge into the existing doc → the new Doc;
                                                                 // STORE_NOT_FOUND if there is none
col.delete(id);                                            // buffered; no error if missing
const ready = await col.find({ where: { status: 'ready' }, orderBy: [['createdAt', 'desc']], limit: 50 });  // Doc[]
const n     = await col.count({ where: { status: 'ready' } });                                               // number
```
- `find` returns every matching document (after `orderBy`, up to `limit` when given). Ascending order ranks missing or `null` < `false` < `true` < numbers < strings (by code point) < arrays and objects; `desc` reverses it; ties are ordered by id (ADR 0036).
- `patch` applies a JSON Merge Patch (RFC 7396): nested objects merge, arrays are replaced, `null` removes a field (ADR 0037). The hard cap is 5,000 documents or 16 MB per `find`: a result over the cap fails `STORE_RESULT_TOO_LARGE` (hint: add a filter or a `limit`), it is never silently cut. `limit` just takes the first N.
- Filter language (shared with UI conditions, `08` §8.7):
  ```ts
  where: { status: 'ready', size: { gt: 1000 }, name: { prefix: 'inv' }, tags: { in: ['a','b'] },
           $or: [ { owner: 'me' }, { shared: true } ] }
  // operators: eq (implicit), ne, gt, gte, lt, lte, in, prefix, exists
  ```
  Semantics (ADR 0008), identical in SQL, in the read-your-writes overlay, and in UI conditions (`08` §8.7):
  - Keys at one level are ANDed; `{}` matches everything. A key is a field name or a dotted path into nested objects and arrays (`meta.size`, `items.0.id`). A missing field and a JSON `null` are the same.
  - A scalar value means `eq`. A plain object value is always an operator object (several operators are ANDed; an unknown operator is invalid). Operands are JSON scalars: `eq` on objects or arrays is not supported.
  - `eq`: strict equality of JSON scalars; `eq: null` matches a missing or `null` field. `ne`: exactly the negation of `eq` (a missing field matches `ne: 'x'`).
  - `gt`, `gte`, `lt`, `lte`: true only when the field and the operand are both numbers, or both strings compared by Unicode code point (the same order as SQLite's `BINARY` collation on UTF-8); any other combination is false.
  - `in` (an array of scalars): a scalar field matches when it equals any element; an array field matches when any of its elements equals any element.
  - `prefix`: the field is a string that starts with the operand (case-sensitive); anything else is false.
  - `exists: true`: the field is present and not `null`; `exists: false`: missing or `null`.
  - `$or`: an array of conditions, true when any matches; `[]` matches nothing; `$or` may nest.
- Declared indexes become SQLite partial expression indexes (`WHERE owner = ? AND collection = ?`) created when the extension is enabled. An unindexed `find` works but scans at most 10,000 documents (`STORE_RESULT_TOO_LARGE` beyond) and logs a warning (kernel log, level `warn`, once per query type and hour). A `find` or `count` is indexed when a top-level `where` condition (outside `$or`) constrains the first field of a declared index, or when the first `orderBy` field is an index's first field and a `limit` is given (ADR 0038).

### Append-only logs
```ts
const history = ctx.store.log(`history:${sessionId}`);
const seq  = await history.append(entry);               // number: the entry's seq (1, 2, 3, … per log)
const tail = await history.read({ after: 120 });        // Array<{ seq, value }>, oldest first
const last = await history.read({ last: 20 });          // the newest 20, oldest first
const one  = await history.last();                      // { seq, value } | undefined
history.truncateBefore(seq);  history.drop();           // buffered
```
- `append` returns the seq at once: the last committed seq, plus the appends pending in this unit, plus one. The commit checks the seq is still free; if another handler took it (only possible when two lanes append to the same log), the unit fails `STORAGE_CONFLICT` and the handler runs again. Appending to one log from one lane (e.g. `session:<id>`) never conflicts.
- `read` takes one of `{ after?: seq, before?: seq, last?: n }` (combinable: `{ after: 10, before: 50 }`) and returns an array under the same cap as `find`.

### Blobs
```ts
const { blobId, size, mime } = await ctx.store.blobs.put(bytes | text | ReadableStream | { workspacePath }, { mime?, name? });  // ≤ 100 MB
const text  = await ctx.store.blobs.text(blobId);        // string (UTF-8), up to 16 MB
const bytes = await ctx.store.blobs.bytes(blobId);       // Uint8Array, up to 16 MB
const s     = await ctx.store.blobs.stream(blobId);      // ReadableStream, any size
const info  = await ctx.store.blobs.stat(blobId);        // { size, mime, name? } | undefined
ctx.store.blobs.keep(blobId);   ctx.store.blobs.release(blobId);   // buffered: add / remove this extension's reference
```
A blob put by a handler is kept automatically when the handler commits (its pending reference becomes a normal one, §4.6); `keep` is for blobs received from others. A put without `mime` stores `text/plain` for a string and `application/octet-stream` otherwise; a put of bytes already stored answers the stored mime and name. `text` and `bytes` of a blob over 16 MB fail `BLOB_TOO_LARGE { max: 16777216 }` (use `stream`); a put over 100 MB fails `BLOB_TOO_LARGE { max: 104857600 }`; `put({ workspacePath })` reads through `ctx.files` and needs `files.read` (ADRs 0134, 0136).

### What is immediate, what is buffered

| Call | Happens | Visible to others |
|---|---|---|
| every read (`get`, `list`, `find`, `count`, `read`, `last`, `blobs.text/bytes/stream/stat`) | immediately | — |
| `kv.set/delete`, `put`, `delete`, `truncateBefore`, `drop`, `keep`, `release` | buffered in the unit of work | at commit |
| `patch`, `append` | read now (to return the result), write buffered | at commit |
| `blobs.put` | file written now; reference at commit | at commit (the blob ID means nothing to others before) |

If the handler fails, nothing buffered happens.

### What reads see

Inside one handler, reads see the handler's own pending writes, applied on top of committed data:
- `get`, `kv.get`, `last`: the pending value if the key was written (`undefined` if deleted).
- `find`, `count`, `kv.list`, `log.read`: committed results with pending puts, patches, deletes, and appends applied, then filtered, sorted, and limited again.

Other handlers see only committed data. Queries see only committed data (they cannot write).

### Typical patterns

```ts
// read, change, write: safe without extra code (the version is checked automatically)
const s = await sessions.get(id);  sessions.put({ ...s, title });
// create with a new id (deterministic across redelivery)
const id = ctx.ids.new();  files.put({ id, name, createdAt: ctx.now() });
// a query handler returns plain arrays
handle: async (_, ctx) => ({ items: await ctx.store.collection(files).find({ orderBy: [['createdAt', 'desc']] }) })
```

## 4.4 Scopes and ownership

- **Scopes**: `workspace` (default) and `global` (`ctx.store.global`).
- **Forgetting a workspace** (`kernel.workspace.forget`) happens in this order:
  1. Stop admitting messages for the workspace (`WORKSPACE_INVALID`), except the `onAbort` commands the kernel sends in step 2 (ADR 0122).
  2. Cancel every unfinished message of the workspace (`kernel.cancel` semantics, `02` §2.9: running invocations are aborted, deferred commands end with `CANCELLED` and their `onAbort` runs, timers are dropped) and kill its processes (`03` §3.7, from M2.6). Wait for these, the `onAbort` commands and the `onExit` commands of its killed detached processes included (ADR 0139), to settle (at most 10 s, then abort).
  3. In one transaction, delete every row with its `ws` for every owner (kv, docs, logs, blob refs), its messages, events, steps, and recorded values, its `llm_usage` rows, its applied preset, its `workspace_config` rows, and its notifications; then its `workspaces` row. Publish `kernel.workspace.forgotten` without a workspace (ADR 0122).
  4. Blobs left without references are collected by the normal GC (§4.6). The folder is never touched (a preview workspace's folder is deleted, `07` §7.1).
- **Ownership**: an extension reads and writes only rows where `owner` is its name. To read another extension's data it calls that extension's queries.
- **Alternatives**: two extensions implementing the same namespace keep separate data; switching the enabled one does not share or migrate data unless the contract defines an export/import command.
- **Uninstall**: the user chooses "keep data" (default) or "delete data" (`06` §6.8).

## 4.5 Step journal (`ctx.step`)

```ts
const text = await ctx.step('ocr', () => runOcr(blobId), { retrySafe: false });
```

- Step names must be unique within one run of a handler; calling `ctx.step` twice with the same name in the same attempt throws `STEP_DUPLICATE` (in a loop, include the index: `ctx.step(`page-${i}`, …)`). Names must be deterministic, so a redelivered handler asks for the same steps.
- `retrySafe` defaults to `false`.

1. `step.begin(messageId, name)`: if a `done` row exists, return its recorded result without running `fn`.
2. If a `started` row exists (a previous attempt crashed mid-step): if `retrySafe`, run again; otherwise throw `EFFECT_INDETERMINATE` (the handler may catch it and decide).
3. Otherwise insert `started` (its own small transaction, committed immediately), run `fn`, then record `done` with its result (≤256 KB, larger results must be blobs; a larger result throws `PAYLOAD_TOO_LARGE` and is not recorded, ADR 0039).

`ctx.command` is implemented as a step. Step rows are deleted with their message at retention time.

## 4.6 Blob lifecycle

- **Blob ids** are the lowercase hex SHA-256 of the bytes (ADR 0018).
- **Put**: the kernel writes the bytes to a temp file and hashes them (SHA-256). Then, in one synchronous step on the kernel main thread (the single writer), it inserts the `blobs` row if missing, adds the reference `pending:<messageId>` owned by the calling extension (expiring at the invocation deadline plus 1 h), and renames the temp file into `blobs/ab/cd/<sha256>` unless that file exists (identical content is stored once). At commit, the handler's pending references become normal references (`blob:<blobId>`) and are removed from the pending list; if the invocation ends without committing, its pending references are deleted.
- **GC** is a kernel background job (at boot, then every 10 minutes, in bounded batches; ADR 0134) that runs in the same single-writer step form. It first deletes expired refs (uploads, and pending refs past their invocation deadline plus 1 h); then it deletes the `blobs` rows that have no live reference (pending ones included) and were created more than 1 h ago, and unlinks their files in the same synchronous step. Because put and GC both run as uninterrupted synchronous steps on the main thread, a put can never link to a file that GC is deleting, and a blob in use by a running handler is never collected, however long the handler runs.
- **Uploads** (`PUT /api/v1/blobs`) create a ref owned by the user with a 24 h expiry.
- **Metadata**: the `blobs` row keeps the mime and name of the first put of those bytes (ADR 0134).
- **Spill**: payloads, command results, and durable event payloads over 256 KB are kernel-owned blobs with the refs `payload:<messageId>`, `result:<messageId>`, and `event:<eventId>`, added and deleted with their rows (ADR 0135).
- **Reading**: an extension may read a blob only if it holds a ref to it in any scope (its own pending refs included), or if the blob arrived during the invocation in a field typed `z.blobId()` of the message it is handling, of a `ctx.command` reply, or of a `ctx.query` result (ADR 0134). At admission the kernel checks that the sender may read every such blob, and a command result, a deferred `ctx.reply`, or a query result is checked the same way against its handler (`CAPABILITY_DENIED`, not retryable), so a blob ID cannot be used to reach someone else's file. For an extension, a blob that does not exist is refused like one it may not read. A handler that wants to keep a received blob calls `ctx.store.blobs.keep(blobId)`, which adds its own ref in the unit of work.
- Blob IDs are visible in events and payloads, but knowing an ID grants nothing. The user can read every blob (it is their data).
- **Serving to browsers**: `12` §12.2 and `13` §13.7.

## 4.7 Config and secrets storage

- **Global config** for extension X: `global_config` row, revisioned.
- **Workspace config** for extension X: the `workspace_config` row (workspace, X), revisioned on its own. The applied preset row holds no config: applying a preset writes these rows from the preset's `config`, and `kernel.preset.current.get`, save-as, and export rebuild the preset's `config` from them (`07` §7.4). So a config change never changes the applied preset's revision or the UI registry (`08` §8.6).
- **Secrets**: `secrets.json`, keyed by `extension/name`. Config schema fields marked `secret` are stored here under their dotted path, never in config rows or presets; a config write carrying one fails `CONFIG_INVALID`. Reads by other extensions or the UI are redacted: `••••` plus the last 4 characters for secrets of 12 or more characters, else `••••` (ADR 0126). Boot step 3 loads the file; one that does not parse refuses to start with `INTERNAL`.
- **Writing secrets**: the file is outside the database transaction. Secret writes (from `kernel.secret.set/clear` and from `ctx.secrets.set` in a unit of work) are applied **after** the database commit, in commit order, by writing a new file (0600), fsyncing it, and renaming it over the old one, so the file is always either the old or the new version. If that write fails, the old value stays, the kernel logs the failure, and it sends an error notification naming the extension and the secret name (never the value); the command that set it has already succeeded.
- Writes go through `kernel.config.set` and `kernel.secret.set` (user or `kernel.admin`), or `ctx.config.set` / `ctx.secrets.set` by the owner itself.

## 4.8 Migrations

- **Kernel**: ordered forward migrations recorded in `schema_versions` (owner `kernel`), run at boot before anything else.
- **Extensions**: `ext.registerDataVersion(2, { migrations: [{ to: 2, up: async (m) => … }] })`; an extension that never calls it is at version 1. There is exactly one migration for each `to` from 2 to the data version, and `compatibleWith` lists lower versions without duplicates (ADR 0046). `m` offers bulk iterate/patch over the extension's own kv, collections, and logs (every workspace and global), and its config (below). The stored data version is the `schema_versions` row whose owner is the extension name (absent = the extension has no data yet, so no migration runs and the row is written with the code's version).
- **When they run**: at enable (the enabled digest's code) and at reload or upgrade (the target digest's code, `06` §6.6 step 4), before that code handles any message, whenever the stored version is lower than the code's data version (`registerDataVersion`, default 1).
- **How they run**: migrations are extension code, so they run in the extension's host, started for this purpose if needed, at the most isolated of the isolation levels granted to the extension across the workspaces where it is (or is being) enabled. First the kernel records `extensions.migrating = { digest, grants? }`: the digest whose code runs the migration, and for a reload the confirmed `grants` from the command. Then each step (`to: n`) runs in its own unit of work, which also sets the stored version to `n`. The unit of work that completes the enable, or the reload's swap (`06` §6.6 step 5), clears `migrating`.
- **Failure**: the failing step's unit of work is discarded.
  - If no step of this run committed, `migrating` is cleared, the data is unchanged, the previous version stays active, and the enable or reload fails with `MIGRATION_FAILED`.
  - If at least one step committed, the data is now at an intermediate version. If the currently active version's storage version or `compatibleWith` covers that version, it stays active and `migrating` is cleared. Otherwise the extension is quarantined with reason `MIGRATION_FAILED` (`03` §3.6), `migrating` is kept, and the recovery page offers **Retry upgrade** (`kernel.extension.reload {name, digest: migrating.digest}`, which resumes from the stored version) or **Disable**. In both cases the command fails with `MIGRATION_FAILED`.
- **Crash during migration**: `migrating` still set at boot means a migration was interrupted. Boot resumes it from the stored version with `migrating.digest`'s code. If that digest is not the active one (an interrupted reload), boot then performs the swap itself (`06` §6.6 steps 5–6, writing `migrating.grants`). If it is the active one (an interrupted enable), boot only clears `migrating`; the enable command itself is redelivered by normal recovery, or the person enables again (`03` §3.9 step 5). A redelivered reload finds the swap already done and succeeds without changes.
- **Config is migrated too**: `m.config.get(scope, workspaceId?)` and `m.config.set(scope, value, workspaceId?)` let a migration step rewrite stored config. After the migrations (or at once when there are none), enable and reload validate every stored config value of the extension (its `global_config` row and every `workspace_config` row) against the target version's config schema. An invalid value blocks the enable or reload with `CONFIG_INVALID`, listing the fields and workspaces; nothing is reset to defaults silently. (New optional fields simply take their defaults.)
- A stored version newer than the code → `SCHEMA_TOO_NEW` (extension not enabled; nothing written).
- The kernel's own check at boot opens the database read-only: a refusal leaves `kvman.db` byte-for-byte unchanged and `kvman.db-wal` empty; SQLite's `-shm` index may appear (ADR 0035).
- Rollback to an older extension version is blocked if its registered storage version is below the stored one, unless the older version registers `compatibleWith` covering it (`EXT_ROLLBACK_BLOCKED`).

## 4.9 Retention and housekeeping

A kernel background job (priority `background`):
- deletes finished messages, their steps, spilled payloads, and events past `retain_until` (default 7 days, per-type overrides);
- expires upload refs and collects unreferenced blobs;
- trims the notification tray: entries past `expires_at`, read entries older than 7 days, all entries older than 30 days, and, per workspace, everything beyond the newest 200 (`08` §8.11);
- finalizes and caps process logs, and deletes ended `processes` rows and their `process:<id>` blob refs 7 days after they ended (with blob GC, every 10 minutes, ADR 0139);
- cancels messages that have been pending for 7 days while their handler's extension is disabled in their workspace (`06` §6.4);
- runs `PRAGMA wal_checkpoint(TRUNCATE)` and, weekly, `PRAGMA optimize`.

## 4.10 Backup and export

- `kvman backup <file>` writes a tar archive with `kvman.db` (made with the SQLite online backup API, so the daemon may keep running) and every referenced blob under `blobs/`. `secrets.json` is never included.
- `kvman restore <file>` extracts such an archive into an empty home folder while no daemon runs for it (otherwise it refuses and says why). Secrets are entered again after a restore (`12` §12.5).
- `kernel.preset.export.get` returns shareable preset JSON only.
- Extensions may offer their own export commands (e.g. `agent.session.export`).
