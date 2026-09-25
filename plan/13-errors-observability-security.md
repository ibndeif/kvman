# 13 — Errors, Observability, Security

## 13.1 Problem envelope

Every failure — HTTP response, late reply on the event stream, reply, tool result — uses one shape:

```ts
type Problem = {
  code: string;            // KERNEL_CODE or namespace/CODE
  title: string;           // stable, public-safe, human readable, English (logs, CLI, the model)
  detail?: string;         // public-safe specifics
  hint?: string;           // what to do next
  params?: Record<string, Json>;   // values for the translated message (08 §8.16)
  retryable: boolean;
  retryAfterMs?: number;   // when retrying makes sense only after a delay (HANDLER_UNAVAILABLE while reloading,
                           // LLM_CALL_FAILED with the provider's retry-after); ADR 0011
  correlationId: string;
  messageId?: string;
  issues?: Issue[];         // validation only
};

type Issue = {
  path: string; message: string; hint?: string;
  code?: string; params?: Json;          // code = Zod issue code, for translation
  severity?: 'error' | 'warning';        // absent = 'error'; kernel.validate's `ok` is false exactly when an
};                                       // issue is an error (naming-grammar and literal-text warnings, ADR 0011)
```

- Internal error text, stack traces, provider error bodies, and secrets never appear in a Problem. They go to the kernel log, redacted, keyed by `correlationId`.
- Extensions declare their errors with `ext.registerError(code, { description, title, retryable?, hint? })` (listed in `/schema`) and throw them with `ctx.problem(code, { params?, detail? })`. Codes must be in the extension's namespace. A thrown code that was never registered is delivered as it is and logged as a warning; the testkit fails such a test (`05` §5.10). An uncaught exception becomes `INTERNAL`: retryable, counted as an attempt, and after `maxAttempts` (default 3) the message is dead-lettered with `MESSAGE_DEAD` (`03` §3.4).
- The model receives tool problems as structured text (`code: title — hint`) so it can react.
- **Translation**: the shell shows a problem in the user's language by looking up `problems.<CODE>` in the owner's catalog (`kvman:` for kernel codes) with `params`, and falls back to `title`. Validation issues are translated by their Zod issue code. The English `title` stays the stable form for logs, the CLI, and the model.

## 13.2 Kernel error catalog

| Code | When | Title (ADR 0022) | Retryable |
|---|---|---|---|
| `VALIDATION_FAILED` | envelope or payload fails its schema (`issues` set) | The request does not match its schema | no |
| `TYPE_NOT_FOUND` | unknown message type in this workspace | Unknown message type in this workspace | no |
| `HANDLER_UNAVAILABLE` | owner disabled, not enabled in the workspace, quarantined, or reloading (queries only; commands wait, `06` §6.6) | The handling extension is not available | yes (reloading, `retryAfterMs`) / no |
| `NAMESPACE_CONFLICT` | enabling a second extension with the same namespace | Another enabled extension owns this namespace | no |
| `CAPABILITY_DENIED` | caller lacks the capability or grant (including a `z.blobId()` field naming a blob the sender may not read) | The caller lacks the capability or grant | no |
| `CALLER_NOT_ALLOWED` | the source does not match the type's `access` (`02` §2.4): a non-user calling an `access: 'user'` type, a person calling an `access: 'extensions'` type, or anyone but the owner and the kernel calling an `internal` one; also a user sending `ui.*` | This caller may not send this type | no |
| `IDEMPOTENCY_MISMATCH` | same key, different request digest | The idempotency key was used for a different request | no |
| `LANE_REENTRANT` | `ctx.command` into its own lane or an ancestor's lane | The command would wait on a lane its own chain holds | no |
| `DEADLINE_EXCEEDED` | the message's `deadlineAt` passed (while pending, awaiting, or running, `02` §2.9) | The message deadline passed | no |
| `HANDLER_TIMEOUT` | one attempt ran longer than the handler's `timeoutMs` (`02` §2.9) | The handler ran longer than its timeout | yes (counts as an attempt) |
| `CANCELLED` | cancelled by `kernel.cancel` or shutdown | The message was cancelled | no |
| `EFFECT_INDETERMINATE` | a non-retry-safe step started but did not record (side effects unknown) | A side effect started but its outcome is unknown | no |
| `MESSAGE_DEAD` | max attempts reached | The message failed after its maximum attempts | no (inspector can retry) |
| `STORAGE_CONFLICT` | optimistic version check failed, or a log seq was taken (normally retried internally) | The data changed while the handler ran | yes |
| `STORE_NOT_FOUND` | `patch` of a document that does not exist | The document does not exist | no |
| `STORE_RESULT_TOO_LARGE` | a `find`, `kv.list`, or `log.read` over 5,000 items or 16 MB, or an unindexed scan over 10,000 documents (`04` §4.3) | The read returns more than the result cap | no |
| `STEP_DUPLICATE` | `ctx.step` called twice with the same name in one handler run | A step name was used twice in one handler run | no |
| `STORAGE_UNAVAILABLE` / `STORAGE_FULL` | disk or database failure / out of space | The database is unavailable / The disk is full | yes / no |
| `PAYLOAD_TOO_LARGE` | over 16 MB after spill | The payload is over 16 MB | no |
| `QUERY_TIMEOUT` | a query over its handler timeout | The query ran longer than its timeout | yes |
| `REPLY_NOT_AWAITING` | `ctx.reply` for a command that already has a reply, was cancelled, or passed its deadline (e.g. a second answer to the same prompt) | The command is no longer waiting for a reply | no |
| `BLOB_NOT_FOUND` / `BLOB_TOO_LARGE` / `BLOB_UNSAFE_TYPE` | blob errors | The blob does not exist / The blob is over the size limit / The blob type cannot be served inline | no |
| `WORKSPACE_INVALID` / `WORKSPACE_ESCAPE` / `WORKSPACE_UNTRUSTED` | workspace path and trust errors | The workspace is not valid / The path leaves the workspace / The workspace files are not trusted | no |
| `CONFIG_INVALID` / `CONFIG_STALE` | config schema or revision errors | The configuration does not match its schema / The configuration changed since it was read | no |
| `PRESET_INVALID` / `PRESET_UNSHAREABLE` / `PRESET_STALE` / `PRESET_SECRET` / `PRESET_REFERENCE_MISSING` / `PRESET_REQUIRED` (enable in a workspace with no applied preset) / `PRESET_INTEGRITY_MISMATCH` (a downloaded package does not match the preset's `integrity`) / `PRESET_READONLY` | preset errors (`PRESET_READONLY`: deleting a built-in preset) | The preset is not valid / The preset cannot be shared / The preset changed since it was read / The preset contains a secret / The preset refers to something that does not exist / The workspace has no applied preset / A package does not match the preset integrity / Built-in presets cannot be changed | no |
| `ROUTE_CONFLICT` | two active pages in a workspace have the same route (`06` §6.3) | Two active pages have the same route | no |
| `LLM_NOT_CONFIGURED` / `LLM_MODEL_NOT_FOUND` / `LLM_THINKING_UNSUPPORTED` / `LLM_CONTEXT_OVERFLOW` | LLM service: no usable provider or model, unsupported thinking level, request too large for the model | No usable LLM provider is configured / The model does not exist / The model does not support this thinking level / The request is too large for the model | no |
| `LLM_CALL_FAILED` | the provider call failed (rate limit, network, provider error); carries `retryAfterMs` when known | The LLM provider call failed | yes |
| `PROVIDER_CONFLICT` | enabling an extension whose LLM provider ID is already registered by another enabled extension | Another enabled extension registers this LLM provider | no |
| `EXT_SOURCE_INVALID` / `EXT_INTEGRITY` / `EXT_MANIFEST_INVALID` (also: `setup` not deterministic, registers after returning, a schema JSON Schema cannot express, over 5 MB, an unknown `manifestVersion`, or manifest drift at load) / `EXT_REQUIRES_MISSING` (types or components) / `EXT_IN_USE` (uninstall while enabled, or disable while another enabled extension requires it) / `EXT_QUARANTINED` / `EXT_ROLLBACK_BLOCKED` / `EXT_GRANTS_REQUIRED` (a reload needs new grants, `06` §6.6) | extension lifecycle | The extension source is not valid / The extension snapshot failed its integrity check / The extension manifest is not valid / Required types or components are missing / The extension is in use / The extension is quarantined / The data schema does not allow this rollback / The new version needs new grants | no |
| `SCHEMA_TOO_NEW` / `MIGRATION_FAILED` | persisted data versions | The stored data is newer than this code / A data migration failed | no |
| `CONFIRMATION_EXPIRED` | preview token expired or staged bytes changed | The confirmation expired or the staged content changed | yes (preview again) |
| `DAEMON_CONFLICT` | another kernel owns the lock | Another kernel owns this home folder | no |
| `HOME_INVALID` | the home folder holds other files but no `kvman.db` (`03` §3.9) | The home folder holds other files | no |
| `HOST_FORBIDDEN` | bad `Host` or `Origin`, or a refused `Sec-Fetch-Site` | The request Host or Origin is not allowed | no |
| `NOT_FOUND` | an unknown message id or route, or a subscription for a stream with no open connection (ADR 0095) | The resource does not exist | no |
| `PORT_UNAVAILABLE` | no free port in 4173–4199 (`{ from, to }`), or the `--port` given is taken (`{ port }`) (ADR 0095) | No port is free for the kernel | no |
| `KERNEL_STOPPING` | a request that arrives during shutdown (ADR 0090) | The kernel is shutting down | yes |
| `INTERNAL` | unexpected error (details in the log) | Unexpected error | yes |

Extension codes used across the plan: `agent/SESSION_CLOSED`, `agent/CONTEXT_TOO_LARGE`, `agent/COMPACT_FAILED`, `agent/TOOL_DENIED`, `agent/UNKNOWN_TOOL`, `agent/REVIEW_REJECTED`, `agent/NOT_A_GUARD`, `agent/SECTION_LIMIT`, `agent/SESSION_NOT_FOUND`, `agent/DEPTH_EXCEEDED`, `shell/TIMEOUT`, `interviewer/BUSY`, `fs/NOT_FOUND`, `pdf/NOT_FOUND`.

## 13.3 Logging

- Pino JSON to `~/.kvman/logs/kernel.log`, rotated daily and at 50 MB, 14 files kept, by the kernel's own rotating stream (`kernel.<yyyy-mm-dd>.<n>.log`, ADR 0093). HTTP requests are logged as method, route pattern, status, and duration only.
- Every line has `correlationId`, and where relevant `messageId`, `type`, `extension`, `workspaceId`, `lane`, `attempt`, `durationMs`.
- **Never logged**: message payloads, config values, secrets, authorization data, request bodies, raw provider errors. Extension `ctx.log` output goes through the same redaction (known secret fields, bearer tokens, URLs with credentials); the kernel attaches `correlationId`, `messageId`, `type`, `extension`, `workspaceId`, and `attempt` to each line (ADR 0073).
- Process output lives only in job logs (sensitive, capped, readable through `shell.job.log.get`), never in the kernel log.

## 13.4 Tracing and the inspector

- The `messages` and `events` tables are the trace store: `correlationId` groups a user action, `causationId` builds the tree, timestamps give durations, `attempts` and `result` give outcomes.
- `kernel.trace.get {correlationId}` returns the tree with states, durations, attempts, and problem codes (payloads only on explicit reveal, redacted).
- The `inspector` extension (`10` §10.10) renders traces, dead letters, live traffic, and processes.

## 13.5 Metrics

`kernel.metrics.get` exposes: messages admitted/completed/failed per type, handler latency percentiles, queue depth per lane and priority, commit batch size and latency, host utilization and restarts, quarantines, open event streams and subscriptions, dropped live-event messages, blob store size, database size.

## 13.6 Security model

### Threat model (v2)

| In scope | Out of scope (v2) |
|---|---|
| Malicious web pages attacking the localhost API (CSRF, DNS rebinding, XSS) | Other local users or processes on the same account (they can already run code as the user) |
| Untrusted content rendered in the UI (LLM output, documents, logs) | A malicious extension author in `shared` isolation (trusted-code model, disclosed) |
| Buggy or overreaching builder-generated extensions | Network exposure beyond localhost (no auth; `--unsafe-bind` warns) |
| Untrusted workspace files (repo rules/skills/presets) | Multi-user permissions |
| Supply chain of installed extensions | |

### Controls

| Area | Control |
|---|---|
| Localhost API | bind `127.0.0.1`; `Host` allowlist; `Origin` must match when present (non-browser clients send none); `Sec-Fetch-Site` must be `same-origin` when present; JSON-only; no cookies; risk banner. Honest boundary: any local process, including a raw `shell.exec` command, can call the HTTP API as `user:local` and therefore pass `access: 'user'` checks; the Assistant and Extension Builder presets have no shell tool, and the Coding Agent preset includes `local-guard` (`10` §10.11), a guard that asks the person before any shell command that names the kvman port, home folder, or socket (a text check: it narrows the gap, it does not close it) |
| Capabilities | requested (`ext.requestCapability`, including `tools` for agents) or derived from registrations (`subscribes`, `provides-llm`) → granted with reasons shown → enforced on every `ctx` call, at commit, on event delivery, and on view targets; `access` on every command and query (`02` §2.4); job tokens limit processes |
| Isolation | built-in extensions `shared`; every other extension `sandboxed` by default, lower levels only as a user grant with a warning; `shared` = trusted code (disclosed); `dedicated` = crash containment; `sandboxed` = Node permission model (fs, child processes, workers, native addons enforced; `node:sqlite` turned off, because the model does not cover it, `03` §3.5; network declared and disclosed, enforced automatically once the running Node supports it — R-Q2); builder code always sandboxed; the install-time loader that records `setup` is sandboxed too |
| Cross-extension data | own storage only; blobs only with a ref or a `z.blobId()` hand-over; foreign events only with a derived grant (a guard's subscription to `agent.tool.call.created` is disclosed as "sees every tool call the agent makes, with its arguments"); `kernel.messages.list`, trace payloads, and other extensions' processes only with `kernel.admin`; LLM prompts reach only the provider the user enabled (`provides-llm` disclosed) |
| Workspace files | `ctx.files` realpath jail; `~/.kvman` refused; `.kvman/` trust gate with hash preview and change re-prompt |
| Shell | honest non-sandbox: `shell.exec` runs as the user; process groups and kill paths; logs capped; disclosed in UI and prompt |
| Secrets | `secrets.json` 0600; never in presets, messages, logs, exports, or traces; redacted on foreign reads |
| Supply chain | exact versions/commits; presets pin `integrity` (npm `dist.integrity`, git commit, builtin bundle) and apply fails `PRESET_INTEGRITY_MISMATCH`; install scripts disabled; undeclared imports rejected; built JavaScript required; content-addressed snapshots with a local digest; rehash before load; quarantine on mismatch; builder projects import only `@kvman/sdk` |
| Presets | import is inert; apply shows every extension and capability; shareability checks |
| UI rendering | declarative views; one Markdown component with the locked sanitizer; no `v-html` elsewhere; plain-text logs; translations inserted as text, never HTML; strict shell CSP |
| UI placement | UI is registered and validated before it runs, never pushed at runtime; every container accepts only declared kinds; shell-only zones (kvman menu, notifications, connection, risk banner, grant dialog) accept no contributions and cannot be hidden; bidirectional control characters are stripped from extension text shown there; public components cannot send commands of their own, so no component borrows its user's grants |
| Visibility | presets hide contributions but never grant or block anything; hidden pages stay reachable; the apply dialog lists what a preset hides |
| Notifications | drawn only by the shell with the sender's name (the kernel-assigned source), so no extension can pose as kvman or another extension; action buttons checked at admission like view actions (no grant, foreign user-only, or internal commands); per-extension rate limits; muting by the person; the tray is readable only by the user and `kernel.admin` |
| Widgets | per-extension `*.localhost` origin; `sandbox="allow-scripts"` without same-origin; strict widget CSP; bridge limited to the extension's types, events, and blobs and the page's workspace |
| Prompt injection | granting power (trust, enabling with grants, upgrades with new grants, preset import/apply) and every approval or answer to a prompt are `access: 'user'` commands enforced by the kernel on the kernel-assigned source; `agent.send` is user-only, so no extension can speak as the person; the model's tool calls pass ADMIT (known tool, valid arguments) and every covering guard before anything runs (`09` §9.3, §9.5); `local-guard` asks before shell commands that reach kvman; extensions, `kv` processes, and widgets can prepare but never confirm; an extension's views can send only its own types and granted `calls`; power is confirmed only in the shell-drawn grant dialog (D41); the view language has no automatic triggers; the agent cannot grant capabilities |

## 13.7 Blob serving policy

- `GET /api/v1/blobs/:id` always sends `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`.
- Inline display only for an allowlist of inert types verified by content sniffing: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `text/plain` (as `text/plain; charset=utf-8`). Everything else, including SVG, HTML, and PDF, is served with `Content-Disposition: attachment`. PDFs are displayed through a widget that reads bytes via the bridge.
- Size limit: 100 MB per blob, for uploads (`PUT /blobs`) and `ctx.store.blobs.put` alike (`BLOB_TOO_LARGE`); fixed in v2.

## 13.8 Security tests (required, see `14`)

XSS payload matrix for Markdown and all text components (scripts, event attributes, SVG/MathML, encoded `javascript:`, `data:` URLs, malformed tables, fenced HTML, external link `rel`); Host/Origin rejection including DNS-rebinding hosts; event stream cross-origin rejection (`Sec-Fetch-Site`, no CORS); widget isolation (no parent DOM access, no cross-extension calls, no network); capability denial for every `ctx` surface; `CALLER_NOT_ALLOWED` for user-only and internal commands from extensions, processes (job tokens), and widget bridges; cross-extension separation (views targeting foreign user-only types without `calls`, foreign events without a subscription grant, blobs without a ref or hand-over, admin-only kernel queries); grant dialog cannot be opened with a forged preview or confirmed without a click; contributions placed in slots that do not accept their kind, extension content in shell-only zones, and `frame.*` names are rejected; a public component with its own command action is rejected, and an action passed into a component is checked against the passing view's owner; bidirectional-override text in the grant dialog is neutralized; a preset that hides the Extensions page still shows it in the apply dialog and under "Show hidden pages"; a notification whose button targets a grant command, a foreign user-only or internal command, or a type outside the sender's own and granted `calls` is rejected, and one sent by an extension never shows as kvman; sandboxed install-time loader; sandbox OS denials; job-token scope (a delegated token reaches only `allowTypes` that the requesting agent may send); a dev version enabled in a preview workspace is never granted `process`, `network`, `kernel.admin`, or lower isolation; a reload that needs new capabilities fails `EXT_GRANTS_REQUIRED` unless confirmed in the grant dialog; the shell refuses to be framed by any origin but its own; trust gate change detection; secret redaction in logs, traces, presets, and exports; blob content-type spoofing; a guard extension enabled together with the agent holds every tool call until it registers (no call runs unguarded); `access: 'extensions'` types refuse people and views, and `access: 'user'` types refuse processes and widget bridges; `agent.send` from an extension fails `CALLER_NOT_ALLOWED`; a widget cannot subscribe to another extension's live events; `kernel.dev.file.*` and `kernel.dev.files.list` refuse `..`, absolute paths, and symlinks, and `kernel.dev.build` cannot write outside `dist/`; a POST with a foreign `Origin` is refused while one without `Origin` is accepted; a crash while writing `secrets.json` leaves the old or the new file, never a partial one; a package whose tarball differs from the preset's `integrity` fails `PRESET_INTEGRITY_MISMATCH`; `local-guard` asks the person before `curl http://127.0.0.1:<port>/api/v1/commands/<type>` runs and allows an ordinary command at once; a sandboxed extension host, the install-time loader, and a builder test process cannot load `node:sqlite` (through `import`, `require`, or `process.getBuiltinModule`) and cannot open `kvman.db`; a builder project's test cannot write a file, start a process or worker, or load an addon, and the project's `tsconfig.json` cannot change the compiler options.
