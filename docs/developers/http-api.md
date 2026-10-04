# The HTTP API

This page is for anyone calling kvman from a script, a UI, or another program. When you finish, you can call a command or query, read the answer envelope, follow a job's progress stream, upload and download files, and know exactly what protects the listener.

kvman serves the API with Hono on `127.0.0.1:3737` (change it with `--port` or the `kernel.port` setting). The web UI and scripts use it. It reaches only **public** commands and queries, and the caller is `{ kind: 'user' }`.

## Routes

| Route | Body → answer |
|---|---|
| `POST /api/commands/:name` | `{ input, workspaceId?, async? }` → `{ ok: true, output, jobId }`, or with `async: true`, `{ ok: true, jobId }` |
| `POST /api/queries/:name` | `{ input, workspaceId? }` → `{ ok: true, output, jobId }` |
| `GET /api/jobs/:id` | → `{ ok: true, job }` |
| `GET /api/jobs/:id/stream` | Server-Sent Events (below) |
| `POST /api/jobs/:id/cancel` | → `{ ok: true }` |
| `POST /api/files?name=…&workspaceId=…` | the raw file as the body, with `Content-Type` as its media type (`application/octet-stream` when absent) → `{ ok: true, file }` |
| `GET /api/files/:id?workspaceId=…` | → the raw content, with its `Content-Type`, as an attachment |
| `GET /api/locales/:lang` | → `{ ok: true, catalog }` |

- `workspaceId` defaults to Home for commands and queries; the file routes require it (`VALIDATION_FAILED` without it), and a file of another workspace is `NOT_FOUND`. A closed or unknown workspace fails `NOT_FOUND`.
- A query name on the commands route, or a command name on the queries route, fails `NOT_FOUND`.
- The target is resolved before the body is read (`NOT_FOUND`, `NOT_PUBLIC`). A raw body over the target's `maxInputBytes` fails `TOO_LARGE` and is read no further. A JSON body of the wrong shape fails `VALIDATION_FAILED`.
- A sync call whose client disconnects is cancelled.
- Downloads are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so they are never rendered on kvman's origin. An upload's `name` is required, and one over 1 GiB fails `TOO_LARGE`, with the partial file removed.
- `GET /web/<namespace>/<path>` serves a file from that extension's `kvman.web` folder; anything else outside `/api` and `/web` serves the `kernel.web.home` extension's folder (an app route falls back to its `index.html`).

## The envelope

Every JSON answer is `{ ok: true, …data }` or `{ ok: false, problem, jobId? }`, with status 200. A command or query failure also carries its `jobId`. The two exceptions are a file download, which returns raw content, and a body that isn't valid JSON.

```sh
curl -s http://127.0.0.1:3737/api/commands/kernel.workspace.open \
  -H 'content-type: application/json' -d '{ "input": { "path": "/home/me/project" } }'
```

A Problem is `{ code, message, params? }` ([errors.md](errors.md)). `message` is English, for logs and scripts.

## The job stream

`GET /api/jobs/:id/stream` is the only push channel, and only async and scheduled jobs have one. It sends each `ctx.job.progress(data)` chunk of the job and of every job nested in it as a `progress` event `{ source, data }`, then one `result` event (the output) or `problem` event (the Problem, `CANCELLED` for a cancelled job), then closes. Each event's `data:` is JSON. There is no heartbeat. A running job keeps its last 256 KiB of progress chunks (oldest dropped first) and a client that connects late gets them before the live ones; a finished job answers with its `result` or `problem` at once, without chunks.

```sh
JOB=$(curl -s .../api/commands/notes.index.run -H 'content-type: application/json' -d '{"input":{},"async":true}' | jq -r .jobId)
curl -N http://127.0.0.1:3737/api/jobs/$JOB/stream
```

## Security

- kvman listens only on `127.0.0.1`.
- A request whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>` is rejected, and so is a request whose `Origin`, when present, isn't exactly `http://` plus that same host (`Origin: null` included). The answer is the envelope with `FORBIDDEN_ORIGIN`, whose `params` never echo the rejected values.
- There is **no token** in this phase: any local program can call the API. Don't expose the port.

These checks are never relaxed, and a test that needs them off is a wrong test.

## Limits

| Limit | Value | Error |
|---|---|---|
| Job input or output | 1 MiB of JSON by default; a registration may set up to 32 MiB | `TOO_LARGE` |
| Progress chunk | 64 KiB | `TOO_LARGE` |
| Progress replay per running job | 256 KiB (oldest dropped) | — |
| File | 1 GiB | `TOO_LARGE` |
| Store document or kv value | 16 MiB of JSON | `TOO_LARGE` |
| `find` and `list` limits | required, at most 1000 | `VALIDATION_FAILED` |
| Sync `ctx.exec` depth | 16 | `TOO_DEEP` |

## Next

- [kernel-api.md](kernel-api.md)
- [errors.md](errors.md)
- [jobs.md](jobs.md)
