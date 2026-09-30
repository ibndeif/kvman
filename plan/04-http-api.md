# 04 — HTTP API

The kernel serves the API with Hono (`hono` and `@hono/node-server`) on `127.0.0.1:3737`. The web UI and scripts use it. It reaches only `public` commands and queries, and the caller is `{ kind: 'user' }`.

## 4.1 Routes

| Route | Body → answer |
|---|---|
| `POST /api/commands/:name` | `{ input, workspaceId?, async? }` → `{ ok: true, output, jobId }`, or with `async: true`, `{ ok: true, jobId }` |
| `POST /api/queries/:name` | `{ input, workspaceId? }` → `{ ok: true, output, jobId }` |
| `GET /api/jobs/:id` | → `{ ok: true, job }` |
| `GET /api/jobs/:id/stream` | Server-Sent Events (§4.4) |
| `POST /api/jobs/:id/cancel` | → `{ ok: true }` |
| `POST /api/files?name=…&workspaceId=…` | The raw file as the body, with `Content-Type` as its media type (`application/octet-stream` when absent) → `{ ok: true, file }` |
| `GET /api/files/:id?workspaceId=…` | → the raw content, with its `Content-Type`, as an attachment |
| `GET /api/locales/:lang` | → `{ ok: true, catalog }` (§2.11) |

- `workspaceId` defaults to Home for commands and queries; the file routes require it (`VALIDATION_FAILED` without it), and a file of another workspace is `NOT_FOUND` (ADR 0009, 37). A closed or unknown workspace fails `NOT_FOUND`.
- A query name on the commands route, or a command name on the queries route, fails `NOT_FOUND`.
- The target is resolved before the body is read (`NOT_FOUND`, `NOT_PUBLIC`). A raw body over the target's `maxInputBytes` fails `TOO_LARGE`, and is read no further. A JSON body of the wrong shape (strict `{ input, workspaceId?, async? }`; the queries route has no `async`) fails `VALIDATION_FAILED`. A failure before a job starts carries no `jobId` (ADR 0009, 40).
- **Files.** A download is served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so it's never rendered on kvman's origin (ADR 0009, 38). An upload's `name` is required (`VALIDATION_FAILED`), and one over 1 GiB fails `TOO_LARGE`, with the partial file removed (ADR 0009, 39).
- A sync call whose client disconnects is cancelled (§2.3).
- **The envelope.** Every JSON answer is `{ ok: true, …data }` or `{ ok: false, problem, jobId? }`, with status 200. A command or query failure also carries its `jobId`: `{ ok: false, problem, jobId }`. The two exceptions: a file download returns raw content, and a body that isn't valid JSON gets 400.

**Static files.**
- `GET /web/<namespace>/<path>` serves a file from that extension's `kvman.web` folder. A path that leaves the folder, or a missing file, gets 404.
- `GET /<anything else outside /api and /web>` serves the `kernel.web.home` extension's folder, falling back to its `index.html` for app routes.
- When HTTP starts, the `kernel.web.home` extension must exist and declare `kvman.web` (`EXTENSION_INVALID` otherwise; ADR 0009, 41). A miss outside `/api` is a plain 404; an unknown `/api/…` route is the envelope with `NOT_FOUND`.

## 4.2 Security

- kvman listens only on 127.0.0.1.
- A request whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>` is rejected, and so is a request whose `Origin`, when present, isn't exactly `http://` plus that same Host (`Origin: null` included; ADR 0009, 36). The answer is the envelope with `FORBIDDEN_ORIGIN`, whose `params` never echo the caller's values. This keeps websites out, including through DNS rebinding.
- There is no token in this phase: any local program can call the API.

## 4.3 Problems

A Problem is `{ code, message, params? }` (§5). `message` is English for logs and scripts; the UI shows the translated `<namespace>.errors.<CODE>` with `params`.

## 4.4 The job stream

`GET /api/jobs/:id/stream` is the only push channel. Only async and scheduled jobs have one; progress from a sync root job goes nowhere.

- It sends each `ctx.job.progress(data)` chunk of the job and of every job nested in it as a `progress` event `{ source, data }`, then one `result` event (the output) or `problem` event (the Problem, `CANCELLED` for a cancelled job), then closes. Each event's `data:` is JSON. There is no heartbeat. An unknown id, or a sync job's, gets the envelope with `NOT_FOUND` (ADR 0009, 42).
- Chunks aren't stored. A client that connects late sees only new chunks, and a finished job answers with its `result` or `problem` at once.
- Anything that must survive, such as an agent's messages, the extension keeps in its store.
