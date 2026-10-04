# Errors

This page is for anyone who handles or throws errors in kvman. When you finish, you can read a Problem, know what every kernel error code means and what to do about it, and define and translate error codes of your own.

## The Problem

Every failure is a **Problem**: `{ code, message, params? }`, where `params` is a record of JSON values. In code a Problem is thrown as a `ProblemError`, an `Error` carrying `.problem`.

- Kernel codes are `UPPER_SNAKE`, from the table below.
- An extension's codes are `<namespace>/UPPER_SNAKE`, made with `ctx.problem('notes/NOT_ALLOWED', { id })`. They are never retried.
- Each code has a translated text, `<namespace>.errors.<CODE>`, in `en` and `ar`; the kernel's namespace is `kernel`.
- `message` is English, for logs and scripts; people see the translated text with `params` filled in.
- Errors are never thrown as strings, never swallowed, and never returned as `null`.

```ts
if (!input.allowed) throw ctx.problem('notes/NOT_ALLOWED', { id: input.id });
```

```json
{ "ok": false, "problem": { "code": "notes/NOT_ALLOWED", "message": "…", "params": { "id": "n1" } }, "jobId": "…" }
```

## Kernel codes

| Code | When | What to do |
|---|---|---|
| `VALIDATION_FAILED` | Input, output, a setting, the preset, or a request is invalid. | Read the message and the issue paths; fix the input. |
| `NOT_FOUND` | No such command, query, job, file, workspace, schedule, or setting. | Check the name or id; a closed workspace is `NOT_FOUND` too. |
| `NOT_PUBLIC` | A private name was called from outside its extension, or another extension's setting or file was written. | Make the registration `public: true`, or call your own. |
| `NOT_A_COMMAND` | `execAsync` or `schedule` was given a query. | Queue commands only. |
| `READ_ONLY` | A query tried to write, queue, schedule, or run a command. | Make it a command. |
| `NO_JOB` | A job-bound `ctx` call ran outside a handler. | Call it from a handler. |
| `TOO_LARGE` | Over a limit; `params.limit`. | Send less, or raise `maxInputBytes`/`maxOutputBytes` (at most 32 MiB). |
| `TOO_DEEP` | Sync `ctx.exec` nested deeper than 16; `params.limit`. | Use `execAsync` to start a new chain. |
| `TIMEOUT` | An attempt ran past its `timeoutMs`. | Pass `ctx.job.signal` to what you await; raise the timeout or split the work. |
| `CANCELLED` | The job was cancelled. | Nothing; it isn't retried. |
| `WORKER_CRASHED` | The worker died during the attempt. | Retried for async jobs; look in `logs/kvman.log`. |
| `INTERRUPTED` | kvman stopped, or died, during the attempt. | Retried for async jobs; write handlers that are safe to repeat. |
| `HANDLER_FAILED` | A handler threw something that isn't a Problem. Its message is logged, never sent. | Throw `ctx.problem(…)` for expected failures; read the log for the rest. |
| `FORBIDDEN_ORIGIN` | A request's Host or Origin isn't kvman's own. | Call `127.0.0.1:<port>` or `localhost:<port>`, with no foreign `Origin`. |
| `PROCESS_RUNNING` | `ctx.processes.start` was given the name of a running process. | Stop it first, or pick another name. |
| `PORT_IN_USE` | The port is taken (start only). | Use `--port`, or stop what holds it. |
| `EXTENSION_INVALID` | A manifest, dependency, namespace, registration, or entry failed at load, or an install or trust step failed. | See [anatomy.md](anatomy.md) for the causes. |
| `KVMAN_RUNNING` | Another kvman holds this home's lock. | Use a second `kvman` to hand your folder over, or give `--home`. |

### Retries

For async and scheduled jobs, `HANDLER_FAILED`, `TIMEOUT`, `WORKER_CRASHED`, and `INTERRUPTED` are retried with backoff until the retries run out. Every other Problem, yours included, ends the job at once. Sync jobs are never retried. See [jobs.md](jobs.md).

## Defining your own

1. Pick codes under your namespace: `notes/NOT_ALLOWED`, `notes/QUOTA_EXCEEDED`.
2. Throw them with `ctx.problem(code, params?)`.
3. Add a text for each to every catalog: `"notes.errors.NOT_ALLOWED": "You can't do that to a note."`, in `locales/en.json` and `locales/ar.json` ([localization.md](localization.md)).
4. Document them where others look: your extension's docs page ([documenting-your-extension.md](documenting-your-extension.md)).

The core extensions follow this: `kvai/KEY_MISSING`, `kvcoder/NAME_TAKEN`, `kvcustomizer/NPM_FAILED`, and so on.

## What never goes in a Problem

Don't put a secret, a setting value, or a request body in `message` or `params`: Problems reach logs, job rows, and HTTP answers.

## Next

- [jobs.md](jobs.md)
- [localization.md](localization.md)
- [http-api.md](http-api.md)
