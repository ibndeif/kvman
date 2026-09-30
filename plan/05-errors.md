# 05 — Errors

Every failure is a Problem: `{ code, message, params? }`, where `params` is a record of JSON values. In code, a Problem is thrown as a `ProblemError`, an `Error` carrying `.problem`.

- Kernel codes are `UPPER_SNAKE`, from the table below.
- Extension codes are `<namespace>/UPPER_SNAKE`, made with `ctx.problem(code, params)`.
- Each code has a translated text, `<namespace>.errors.<CODE>`, in `en` and `ar`, where the kernel's namespace is `kernel`.
- Errors are never thrown as strings, never swallowed, and never returned as `null`.

| Code | When |
|---|---|
| `VALIDATION_FAILED` | Input, output, a setting, the preset, or a request is invalid. |
| `NOT_FOUND` | No such command, query, job, file, workspace, schedule, or setting. |
| `NOT_PUBLIC` | A private name was called from outside its extension, or another extension's setting or file was written (ADR 0009, 24). |
| `NOT_A_COMMAND` | `execAsync` or `schedule` was given a query. |
| `READ_ONLY` | A query tried to write, queue, schedule, or run a command. |
| `NO_JOB` | A job-bound `ctx` call ran outside a handler. |
| `TOO_LARGE` | Over a limit (§2.13); `params.limit`. |
| `TOO_DEEP` | Sync `ctx.exec` nested deeper than 16; `params.limit`. |
| `TIMEOUT` | An attempt ran past its `timeoutMs`. |
| `CANCELLED` | The job was cancelled. |
| `WORKER_CRASHED` | The worker died during the attempt. |
| `INTERRUPTED` | kvman stopped, or died, during the attempt (§2.3). |
| `HANDLER_FAILED` | A handler threw something that isn't a Problem. Its message is logged, never sent. |
| `FORBIDDEN_ORIGIN` | A request's Host or Origin isn't kvman's own (§4.2). |
| `PROCESS_RUNNING` | `ctx.processes.start` was given the name of a running process. |
| `PORT_IN_USE` | The port is taken (start only). |
| `EXTENSION_INVALID` | A manifest, dependency, namespace, registration, or entry failed at load. |
| `KVMAN_RUNNING` | Another kvman holds this home's lock. |
