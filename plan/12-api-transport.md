# 12 — API and Transport

All adapters are thin: they authenticate the caller, turn a request into a message, and return the result. None contains feature logic. The same message types are reachable from every adapter.

## 12.1 Adapters

| Adapter | Listens | Caller identity | Used by |
|---|---|---|---|
| HTTP | `127.0.0.1:<port>` (4173, else the first free port in 4174–4199; §12.5) | `user:local` (shell requests name their tab: `user:local/client:<clientId>`) | shell (everything it sends), CLI, scripts |
| Event stream (SSE) | `GET /api/v1/events` on the same port | `user:local` (shell requests name their tab: `user:local/client:<clientId>`) | shell (one stream per browser), CLI `kvman events` |
| Local socket | `~/.kvman/kernel.sock` (0600) | `proc:<processId>` via job token | `kv` shim inside processes |
| Static | `/` | — | shell SPA assets |
| Widget origins | `http://w-<hash>.localhost:<port>/` | — | widget files only |

## 12.2 HTTP endpoints (`/api/v1`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | — | the `kernel.health.get` result (`03` §3.8): `{ status, version, instanceId, processStart, uptimeMs, port, home }` |
| POST | `/commands/:type` | `{ payload, workspaceId?, lane?, idempotencyKey, priority?, wait?: ms }` | `200 { id, reply }`: the handler's result value, in the same response; a failed reply answers its Problem (ADR 0094). `202 { id, state }` only if the handler deferred its reply, if `wait` (default and maximum 60 s) passed first, or if the caller sent `wait: 0` |
| GET | `/messages/:id` | — | `{ id, type, state, reply?, problem? }`: `reply` is a successful reply's value, `problem` a failed one's Problem; an unknown id is 404 `NOT_FOUND` |
| POST | `/queries/:type` | `{ payload, workspaceId? }` | `200 { data }` |
| GET | `/schema?workspaceId=&q=` | — | registry (§12.7) |
| GET | `/ui?workspaceId=` | — | the workspace's UI registry (`08` §8.6); `ETag`, `304` on `If-None-Match` |
| GET | `/ui/pages/:pageId?workspaceId=` | — | `{ page, components }`: a page view and the composite components it uses; same `ETag` |
| GET | `/ui/translations?workspaceId=` | — | translation catalogs of the enabled extensions and the preset for the saved language and its fallbacks (never named in the URL, `08` §8.16); `ETag` |
| PUT | `/blobs` | raw bytes; headers `Content-Type`, `X-Kvman-Filename`, `X-Kvman-Workspace` | `{ blobId, size, mime, name }` (upload ref, 24 h) |
| GET | `/blobs/:id?download=1` | — | bytes with the serving policy of `13` §13.7 |
| GET | `/events?stream=&lastEventId=` | — | `text/event-stream` (§12.3) |
| POST | `/subscriptions` | `{ stream, sid, events?, live?, workspaceId?, since? }` (`events`: type patterns of durable and transient events; `live`: `<type>:<key>` addresses of live events) | `201 { sid }` |
| DELETE | `/subscriptions/:sid?stream=` | — | `204` |

- All bodies are JSON (`Content-Type: application/json` required on POST), validated by Zod, with a Problem envelope on errors (`13` §13.1).
- Status codes: 304 not modified (the `/ui` routes), 400 validation, 403 capability/host, 404 type or message not found, 409 idempotency or revision conflict, 413 payload too large, 422 domain problem, 500 internal, 503 unavailable. A command still running when its request ends answers `202` (not an error). Admission refusals, edge refusals, and failed replies all use one table (ADR 0094):

  | Status | Codes |
  |---|---|
  | 400 | `VALIDATION_FAILED` (also a missing JSON `Content-Type`, an unparsable body, or a bad header) |
  | 403 | `CAPABILITY_DENIED`, `CALLER_NOT_ALLOWED`, `HOST_FORBIDDEN` (also a refused `Sec-Fetch-Site`) |
  | 404 | `TYPE_NOT_FOUND`, `NOT_FOUND` (unknown message or route) |
  | 409 | `IDEMPOTENCY_MISMATCH`, `STORAGE_CONFLICT`, every `*_STALE`, every `*_CONFLICT` |
  | 413 | `PAYLOAD_TOO_LARGE`, `BLOB_TOO_LARGE` |
  | 500 | `INTERNAL` |
  | 503 | `HANDLER_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `KERNEL_STOPPING` |
  | 422 | every other code: extension codes, `DEADLINE_EXCEEDED`, `CANCELLED`, `MESSAGE_DEAD`, `HANDLER_TIMEOUT`, `QUERY_TIMEOUT`, `LANE_REENTRANT`, … |
- Commands and queries answer in the same response: the adapter holds the request open while the kernel calls the registered handler and returns its result (`02` §2.3). Handlers are short by design (long work uses continuations, deferred replies, and live events), so requests stay short.
- Shell requests add `X-Kvman-Stream` and `X-Kvman-Client` headers so late replies and `ui.navigate` reach the right tab (§12.3).
- No feature-specific routes exist. "List sessions" is `POST /api/v1/queries/agent.sessions.list`; "translate" is `POST /api/v1/commands/pdf.translate`. Commands and queries both carry their type in the path, so logs and `curl` read the same way. The `/ui` routes are GET forms of the kernel queries `kernel.ui.get`, `kernel.ui.page.get`, and `kernel.ui.translations.get`, so browsers can cache them with ETags.
- The user's language needs no header: the kernel reads it from the saved preference and puts it in the message context (`02` §2.10).

## 12.3 Event stream (SSE)

The browser sends everything over HTTP (§12.2). The kernel pushes everything over **one Server-Sent Events stream per browser**: durable and transient events, live events, late replies, and one-way `ui.*` messages. Nothing the client sends needs a socket, so there is no WebSocket.

**Identities.** A browser has one `streamId` (random, owned by the shell's stream holder, below). Each tab has its own `clientId`. Every shell POST carries `X-Kvman-Stream: <streamId>` and `X-Kvman-Client: <clientId>`; the kernel assigns the source `user:local/client:<clientId>` (without the header the source is `user:local`). The client ID is for routing (`ui.navigate`, late replies), not security: every client is the same local user.

**Opening.** `GET /api/v1/events?stream=<streamId>` returns `text/event-stream`. The first message is `hello`. The kernel sends `retry: 1000` and a `: ping` comment every 20 s.

**Subscribing.** `POST /api/v1/subscriptions` with `{ stream, sid, events?: string[] /* durable and transient event patterns */, live?: string[] /* <type>:<key> */, workspaceId?, since?: number }` adds a subscription to the stream; `DELETE /api/v1/subscriptions/:sid?stream=<streamId>` removes it. `since` replays matching durable events after that cursor, which is how a subscription created after a reconnect catches up.

Messages on the stream (`event:` name, then `data:` JSON):
```ts
hello   { userId, cursor, protocolVersion, kernelVersion, subscriptions: string[] /* sids still registered */,
          notifications: { unread, attention } }
event   { sid, seq, event }            // durable events also carry `id: <seq>` (the resume cursor); a transient
                                        // event's seq is the cursor when it is sent, with no `id:` (ADR 0098); event =
                                        // { id, type, source, workspaceId?, payload, correlationId, causationId?,
                                        //   createdAt }: the `events` table's fields, pushed or replayed (ADR 0027)
live    { sid, type, key, run, n, chunk }  // a live event (02 §2.3); run = publishing message id; n counts per
                                        // <type>:<key>; a gap in n means "reset every run there and refetch"
reply   { clientId, id, ok: true, data } | { clientId, id, ok: false, problem }   // a reply that missed its POST
ui      { clientId?, type: 'ui.toast' | 'ui.notify' | 'ui.dismiss' | 'ui.navigate', source, payload }  // one-way (08 §8.11)
resync  { reason }                     // the client must refetch its queries and re-subscribe
close   { reason: 'slow-consumer' | 'shutdown' }
```

- **Commands from the shell** use `POST /commands/:type` and get the handler's result in the response, like every caller. Only when the response is `202` (the handler deferred its reply, or it outlived the 60 s request cap) does the reply arrive later, as a `reply` message for that `clientId`. A reply goes to exactly one of the two places; the kernel decides in one step when the request ends.
- **Ordering across the two channels is not guaranteed.** An event caused by a command can arrive before that command's POST response. The shell keys pending and optimistic state by the client-generated `idempotencyKey`, never by the kernel's message ID.
- **Resume**: durable events carry `id: <seq>`, so `EventSource` reconnects with `Last-Event-ID` by itself (a new stream holder passes `?lastEventId=` instead). Subscriptions live in memory per stream and survive a reconnect for 5 minutes; the kernel replays matching `events` rows after the cursor. `hello.subscriptions` lists the sids still registered; the shell re-subscribes the rest with `since: <cursor>` (after a kernel restart, all of them). A cursor older than retention gets `resync`. After a reconnect the shell checks commands still waiting for a reply with `GET /messages/:id`.
- **One stream per browser.** Browsers allow only 6 HTTP/1.1 connections per host, and plain localhost HTTP never uses HTTP/2, so one long-lived stream per tab would stall requests once 6 tabs are open. The shell opens the stream in a `SharedWorker` and routes messages to tabs by `sid` and `clientId`. Where `SharedWorker` is unavailable, the tab holding the Web Lock `kvman-stream` opens it and relays over `BroadcastChannel`; when that tab closes, another tab takes the lock and reconnects with the last cursor. Widget origins are separate hosts and do not share this limit (widgets use the bridge anyway).
- **Scope and connections** (ADR 0098): a subscription with `workspaceId` receives that workspace's events and global ones; without it, every event; live events follow the same rule, and a new live subscription first receives the address's ring (`02` §2.5). A new connection for a stream id replaces the open one (the old response ends with no message). `POST /subscriptions` for a stream with no open connection answers 404 `NOT_FOUND`; `DELETE` of an unknown sid answers 204. A late reply for a stream that is not connected is dropped (the shell checks `GET /messages/:id` after reconnecting).
- **Resync** (ADR 0098): `cursor-expired` when `Last-Event-ID` or `since` is older than the oldest kept event row, `cursor-unknown` when it is ahead of the newest seq. The kernel drops the stream's subscriptions, sends `resync`, and keeps the connection; the client refetches and re-subscribes.
- **Backpressure**: each stream has a 1 MB send buffer (`writableLength`). Over the limit, the kernel first drops `live` messages (the client resets and refetches on the gap in `n`), then sends `close { reason: 'slow-consumer' }` and ends the response; `EventSource` reconnects with its cursor.
- **Security**: `GET /events` requires a valid `Host`, and rejects `Sec-Fetch-Site` values other than `same-origin` when the header is present (browsers always send it; the CLI does not). There are no CORS headers, so another origin can never read the stream. Subscription POST/DELETE go through the normal Origin check (§12.8).
- **Prompts** need no messages of their own: they are data that tabs read with queries and live events, and answers are ordinary `POST /commands/:type` calls to `access: 'user'` types (`08` §8.13).

## 12.4 Local socket and job tokens

- Processes spawned with a `token` (`03` §3.7) receive `KVMAN_SOCKET` and `KVMAN_TOKEN` in their environment.
- Frames (newline-delimited JSON, one request per connection): `{ token, op: 'command' | 'query', type, payload, idempotencyKey?, wait? }` → `{ ok, data | problem }`.
- Processes are never users: types with access `user` or `internal` are rejected with `CALLER_NOT_ALLOWED` whatever the token says.
- The kernel resolves the token to `proc:<processId>`, its allowed types (∩ the spawner's capabilities, or ∩ the requesting actor's capabilities for delegated tokens — `03` §3.7), and its inherited `context` (e.g. `sessionId`). Tokens are revoked when the process exits or is killed.

## 12.5 `kvman` CLI

Talks to the running kernel over HTTP (starts it if needed for commands that require it).

```
kvman start [--port <n>] [--open] [--foreground]      kvman stop · kvman status · kvman open
kvman command <type> [--json - | --<field> <value> …] [--workspace <path>] [--wait 30s]
kvman query <type> [...] [--workspace <path>]          kvman trace <correlationId>
kvman events [<pattern> …] [--workspace <path>]        # follow events over SSE
kvman ext new <dir> [--namespace <ns>]   # a new extension project from the template (below)
         | list | install <source> | enable <name> | disable <name>
         | reload <name> | rollback <name> <digest> | uninstall <name> [--delete-data]
         | dev <path> [--watch]  # a developer's own folder as a dev: source, enabled in a preview workspace
         | types [--out <file>]  # TypeScript declarations for every message type in the workspace
         | pack <project>        # produce an npm-publishable tarball from a builder project
kvman preset list | apply <id> | export <id> > file.json | import file.json      # apply and import ask for
                                                                           # confirmation in the terminal
kvman backup <file> · kvman restore <file> · kvman doctor
every command: [--home <dir>]      # else KVMAN_HOME, else ~/.kvman
```

- **Start**: `kvman start` starts the daemon as a background process (detached, output in `logs/kernel.log`) and returns once `GET /health` answers; `--foreground` keeps it attached to the terminal (tests, service managers) and also writes the log lines to stdout. Commands that need a running kernel start it the same way. The CLI spawns the kernel's daemon script (`@kvman/kernel/daemon`, found by path, never imported) with `--home <absolute path>`, and the daemon reports `{ ok: true, port }` or `{ ok: false, problem }` once over the IPC channel (ADR 0087).
- **Output** of `start`, `stop`, and `status` (ADR 0096): `start` prints `kvman is running at http://127.0.0.1:<port> (home <path>)`; `status` prints the `/health` JSON, or `kvman is not running` with exit 1; `stop` sends `kernel.shutdown`, waits for the lock to be released, and prints `kvman stopped` (or `kvman is not running`, exit 0). Problems go to stderr as `CODE: title` (and the hint) with exit 1.
- **Home**: every command takes `--home <dir>`, else `KVMAN_HOME`, else `~/.kvman`, and finds the kernel through that home's `daemon.lock`. A home folder that holds other files but no `kvman.db` is refused (`HOME_INVALID`, `03` §3.9).
- **npm registry**: `KVMAN_NPM_REGISTRY`, read when the kernel starts (default `https://registry.npmjs.org/`), is the registry the bundled pnpm uses for `npm:` sources (`06` §6.2). Tests point it at a local registry.
- **Port**: `kvman start` binds 4173, else the first free port in 4174–4199, and records it in `daemon.lock` (`03` §3.10). Every other CLI command, `kvman open`, and the `kv` shim find the kernel through the lock, never by assuming 4173. `--port <n>` binds exactly `n` and fails with `PORT_UNAVAILABLE` if it is taken (ADR 0097).
- **Workspace**: every workspace-scoped command (`send`, `query`, `events`, `ext enable/disable/dev`, `preset apply/export`) takes `--workspace <path>`. Without it, the CLI uses the opened workspace whose folder contains the current directory (the deepest one), else Home, and prints which one it used on stderr.
- **`kvman ext new <dir>`** creates a ready-to-run extension project from the same template the builder uses (`11` §11.5): `package.json` (with `peerDependencies['@kvman/sdk']` set to the running version), `src/extension.ts` with one command, one query, one event, and one page, `locales/en.json` and `locales/ar.json`, a passing test, `tsconfig.json`, and a README with the next steps (`kvman ext dev . --watch`, `npm test`, `npm publish`). The namespace defaults to the folder name.
- **`kvman ext install <source>`** stages the source, prints the same preview the grant dialog shows, asks `y/N` (`--yes` skips it), and installs; installing never enables (`06` §6.2).
- **`kvman ext types`** writes TypeScript declarations for every message type visible in the workspace (from `/schema`: inputs, outputs, event payloads) as a module augmentation of `@kvman/sdk`, so `ctx.command('fs.file.get', …)`, `ctx.query`, `ctx.send`, and `ctx.publish` are type-checked against other extensions' schemas. Default output `kvman-types.d.ts` in the current folder.
- **`kvman ext dev <path>`** is for developers who write extensions in their own folder (the builder uses `kernel.dev.build` instead, `11` §11.5). The folder must contain its built JavaScript (`main`). The CLI sends `kernel.dev.folder.stage {path}` (access `user`, `03` §3.8), which stages it through the normal pipeline (`06` §6.2: dependencies with the bundled pnpm, the undeclared-import scan, the loader) as `dev:<name>@<n>`, where `<name>` is the package name without `@` and with `/` replaced by `-` (`@acme/pdf` → `acme-pdf`); the CLI then installs it and enables it in the preview workspace `preview-<name>` under the preview rules (`07` §7.1). `--watch` stages and reloads again when files under the folder change (debounced 500 ms).

The CLI is operated by the person at the terminal, so it may send grant commands (`kernel.extension.enable`, `kernel.preset.import`, `kernel.preset.apply`, …) after printing the same preview the grant dialog shows and asking `y/N`; `--yes` skips the question for scripts. This is the same honest localhost boundary as `13` §13.6. `kvman doctor` checks the lock, the database integrity (`PRAGMA quick_check`), snapshot hashes, the Node permission probe (including that `node:sqlite` is off in sandboxed processes), the `kv` shim's Node path, and the npm registry in use, and prints what it finds.

**Backup and restore** (`04` §4.10): `kvman backup <file>` writes a tar archive of `kvman.db` and the referenced blobs, never `secrets.json`, and works while the daemon runs. `kvman restore <file>` extracts it into an empty home folder and refuses while a daemon runs for that home; the person enters secrets again.

## 12.6 `kv` shim (inside processes)

A tiny dependency-free Node script at `~/.kvman/bin/kv`, placed **last** on `PATH`. Its first line is a shebang with the absolute path of the Node binary running the kernel (`process.execPath`), rewritten at every kernel start, so it works even when that Node is not on the person's `PATH` (nvm, a bundled runtime). `kvman doctor` checks that the shebang points to an existing Node.

```
kv <type> --<field> <value> …          kebab-case flags map to input schema fields
kv <type> --json -  <<'EOF' … EOF      full payload on stdin (for long text)
kv <type> --<field>-file -             one field from stdin
kv help                                 list allowed types with one-line descriptions
kv help <type>                          LLM-friendly Markdown: usage, flags, example, output shape
```

`kv help` lists only types the token allows, so user-only and internal types never appear.

Output: `{"ok":true,"data":…}` on stdout with exit 0; `{"ok":false,"problem":…}` on stderr with exit 1; usage errors exit 2. Help text is generated from the registry, so it is always in sync with the schemas.

## 12.7 Schema endpoint

```ts
{
  kernelVersion, shellVersion, protocolVersion,
  extensions: [{ name, namespace, title, description, icon?, implements? }],
  types: [{ type, kind: 'command' | 'query' | 'event', owner, namespace, description, input?, output?, examples,
            delivery?: 'durable' | 'transient' | 'live', chunk?,             // events
            access?: 'all' | 'user' | 'extensions', agentTool?, slash?, lane?: boolean,
            scope: 'workspace' | 'global' }],   // internal types omitted
  entities: [{ type, owner, description, schema, display }],
  errors: [{ code, owner, description, title, retryable, hint? }],
  contributions: [{ id, kind, owner, description, target? }],
  components: [{ name, owner: 'shell' | <extension>, form: 'builtin' | 'composite' | 'widget',
                  description, props, events, children, parents?, childCount?, examples, since? }],   // ADR 0025, 0029
  frameSlots: [{ name, description, accepts, max? }],                                    // ADR 0025
  contracts: [{ name, major, types }]
}
```
Filtered to what is enabled in the given workspace; `q` does a ranked text search over names and descriptions (used by the builder). The shell renders from the UI registry (`/ui`), not from `/schema`; `/schema` is the reference for developers, LLMs, and the builder, and it also lists the frame slots with their `accepts` and every component spec with its `events` and `children`.

## 12.8 Browser security at the edge

- Bind to `127.0.0.1`. Binding elsewhere (`--unsafe-bind`) is in the post-v2 backlog until the `Host` values a non-loopback bind accepts are decided (ADR 0097).
- **Host check**: every HTTP request, including the event stream, must have `Host` equal to `127.0.0.1:<port>`, `localhost:<port>`, or a widget origin (for widget files only). This blocks DNS-rebinding attacks.
- **Origin check** on every non-GET request: a request **with** an `Origin` header must name the served origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`), else `HOST_FORBIDDEN`; a request **without** `Origin` is accepted, because it comes from a non-browser client (the CLI, a script), which is the stated localhost boundary (`13` §13.6). Browsers always send `Origin` on cross-origin requests and on every POST, so a page on another site is always refused. Any request carrying `Sec-Fetch-Site` must have `same-origin` (or `none`, a typed URL, for GET only). `GET /events` follows the same rules (§12.3). Widget origins can only fetch their own static files.
- JSON-only request bodies, no cookies, no CORS allowances.
- The risk banner states that any local process can drive kvman.

## 12.9 Versioning

- HTTP and the event stream are versioned by path (`/api/v1`). The protocol package carries `protocolVersion`; the shell refuses to run against an incompatible kernel and shows the recovery page instead. `protocolVersion` is a positive integer (`1` in v2), raised on every breaking change to HTTP, the event stream, or the UI contract, and compared for equality (ADR 0030).
- Message types are versioned through their owners' contracts, not through the transport.
