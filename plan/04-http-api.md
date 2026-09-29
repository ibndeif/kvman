# 04 — HTTP API

The kernel serves the API with Hono (`hono` and `@hono/node-server`) on `127.0.0.1:3737`. The web UI and scripts use it. It reaches only `public` commands and queries, and the caller is `{ kind: 'user' }`.

## 4.1 Routes

| Route | Body → answer |
|---|---|
| `POST /api/commands/:type` | `{ input, workspaceId?, async? }` → `{ ok: true, output, jobId }`, or with `async: true`, `{ ok: true, jobId }` |
| `POST /api/queries/:type` | `{ input, workspaceId? }` → `{ ok: true, output, jobId }` |
| `GET /api/jobs/:id` | → `{ ok: true, job }` |
| `GET /api/jobs/:id/stream` | Server-Sent Events (§4.4) |
| `POST /api/jobs/:id/cancel` | → `{ ok: true }` |
| `POST /api/files?name=…&workspaceId=…` | The raw file as the body, with `Content-Type` as its media type → `{ ok: true, file }` |
| `GET /api/files/:id` | → the raw content, with its `Content-Type` |
| `GET /api/locales/:lang` | → `{ ok: true, catalog }` (§2.11) |

- `workspaceId` defaults to Home.
- **The envelope.** Every JSON answer is `{ ok: true, … }` or `{ ok: false, problem }`, with status 200. A command or query failure also carries its `jobId`: `{ ok: false, problem, jobId }`. The two exceptions: a file download returns raw content, and a body that isn't valid JSON gets 400.

**Static files.**
- `GET /web/<namespace>/<path>` serves a file from that extension's `kvman.web` folder. A path that leaves the folder, or a missing file, gets 404.
- `GET /<anything else outside /api and /web>` serves the `kernel.web.home` extension's folder, falling back to its `index.html` for app routes.

## 4.2 Security

- kvman listens only on 127.0.0.1.
- A request whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>` is rejected, and so is a request whose `Origin`, when present, isn't that same origin. The answer is the envelope with `FORBIDDEN_ORIGIN`, whose `params` never echo the caller's values. This keeps websites out, including through DNS rebinding.
- There is no token in this phase: any local program can call the API.

## 4.3 Problems

A Problem is `{ code, message, params? }` (§5). `message` is English for logs and scripts; the UI shows the translated `<namespace>.errors.<CODE>` with `params`.

## 4.4 The job stream

`GET /api/jobs/:id/stream` is the only push channel.

- It sends each `ctx.job.progress(data)` chunk as a `progress` event, then one `result` event (the output) or `problem` event (the Problem), then closes.
- Chunks aren't stored. A client that connects late sees only new chunks, and a finished job answers with its `result` or `problem` at once.
- Anything that must survive, such as an agent's messages, the extension keeps in its store.
