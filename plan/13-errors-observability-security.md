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
  correlationId: string;
  messageId?: string;
  issues?: Array<{ path: string; message: string; hint?: string;
                   code?: string; params?: Json }>;   // validation only; code = Zod issue code, for translation
};
```

- Internal error text, stack traces, provider error bodies, and secrets never appear in a Problem. They go to the kernel log, redacted, keyed by `correlationId`.
- Extensions declare their errors with `ext.registerError(code, { description, title, retryable?, hint? })` (listed in `/schema`) and throw them with `ctx.problem(code, { params?, detail? })`. Codes must be in the extension's namespace. A thrown code that was never registered is delivered as it is and logged as a warning; the testkit fails such a test (`05` §5.10). An uncaught exception becomes `INTERNAL`: retryable, counted as an attempt, and after `maxAttempts` (default 3) the message is dead-lettered with `MESSAGE_DEAD` (`03` §3.4).
- The model receives tool problems as structured text (`code: title — hint`) so it can react.
- **Translation**: the shell shows a problem in the user's language by looking up `problems.<CODE>` in the owner's catalog (`kvman:` for kernel codes) with `params`, and falls back to `title`. Validation issues are translated by their Zod issue code. The English `title` stays the stable form for logs, the CLI, and the model.

## 13.2 Kernel error catalog

| Code | When | Retryable |
|---|---|---|
| `VALIDATION_FAILED` | envelope or payload fails its schema (`issues` set) | no |
| `TYPE_NOT_FOUND` | unknown message type in this workspace | no |
| `HANDLER_UNAVAILABLE` | owner disabled, not enabled in the workspace, quarantined, or reloading (queries only; commands wait, `06` §6.6) | yes (reloading, `retryAfterMs`) / no |
| `NAMESPACE_CONFLICT` | enabling a second extension with the same namespace | no |
| `CAPABILITY_DENIED` | caller lacks the capability or grant (including a `z.blobId()` field naming a blob the sender may not read) | no |
| `CALLER_NOT_ALLOWED` | the source does not match the type's `access` (`02` §2.4): a non-user calling an `access: 'user'` type, a person calling an `access: 'extensions'` type, or anyone but the owner and the kernel calling an `internal` one; also a user sending `ui.*` | no |
| `IDEMPOTENCY_MISMATCH` | same key, different request digest | no |
| `LANE_REENTRANT` | `ctx.command` into its own lane or an ancestor's lane | no |
| `DEADLINE_EXCEEDED` | the message's `deadlineAt` passed (while pending, awaiting, or running, `02` §2.9) | no |
| `HANDLER_TIMEOUT` | one attempt ran longer than the handler's `timeoutMs` (`02` §2.9) | yes (counts as an attempt) |
| `CANCELLED` | cancelled by `kernel.cancel` or shutdown | no |
| `EFFECT_INDETERMINATE` | a non-retry-safe step started but did not record (side effects unknown) | no |
| `MESSAGE_DEAD` | max attempts reached | no (inspector can retry) |
| `STORAGE_CONFLICT` | optimistic version check failed, or a log seq was taken (normally retried internally) | yes |
| `STORE_NOT_FOUND` | `patch` of a document that does not exist | no |
| `STORE_RESULT_TOO_LARGE` | a `find`, `kv.list`, or `log.read` over 5,000 items or 16 MB, or an unindexed scan over 10,000 documents (`04` §4.3) | no |
| `STEP_DUPLICATE` | `ctx.step` called twice with the same name in one handler run | no |
| `STORAGE_UNAVAILABLE` / `STORAGE_FULL` | disk or database failure / out of space | yes / no |
| `PAYLOAD_TOO_LARGE` | over 16 MB after spill | no |
| `QUERY_TIMEOUT` | a query over its handler timeout | yes |
| `REPLY_NOT_AWAITING` | `ctx.reply` for a command that already has a reply, was cancelled, or passed its deadline (e.g. a second answer to the same prompt) | no |
| `BLOB_NOT_FOUND` / `BLOB_TOO_LARGE` / `BLOB_UNSAFE_TYPE` | blob errors | no |
| `WORKSPACE_INVALID` / `WORKSPACE_ESCAPE` / `WORKSPACE_UNTRUSTED` | workspace path and trust errors | no |
| `CONFIG_INVALID` / `CONFIG_STALE` | config schema or revision errors | no |
| `PRESET_INVALID` / `PRESET_UNSHAREABLE` / `PRESET_STALE` / `PRESET_SECRET` / `PRESET_REFERENCE_MISSING` / `PRESET_REQUIRED` (enable in a workspace with no applied preset) / `PRESET_INTEGRITY_MISMATCH` (a downloaded package does not match the preset's `integrity`) / `PRESET_READONLY` | preset errors (`PRESET_READONLY`: deleting a built-in preset) | no |
| `ROUTE_CONFLICT` | two active pages in a workspace have the same route (`06` §6.3) | no |
| `LLM_NOT_CONFIGURED` / `LLM_MODEL_NOT_FOUND` / `LLM_THINKING_UNSUPPORTED` / `LLM_CONTEXT_OVERFLOW` | LLM service: no usable provider or model, unsupported thinking level, request too large for the model | no |
| `LLM_CALL_FAILED` | the provider call failed (rate limit, network, provider error); carries `retryAfter` when known | yes |
| `PROVIDER_CONFLICT` | enabling an extension whose LLM provider ID is already registered by another enabled extension | no |
| `EXT_SOURCE_INVALID` / `EXT_INTEGRITY` / `EXT_MANIFEST_INVALID` (also: `setup` not deterministic, registers after returning, a schema JSON Schema cannot express, over 5 MB, an unknown `manifestVersion`, or manifest drift at load) / `EXT_REQUIRES_MISSING` (types or components) / `EXT_IN_USE` (uninstall while enabled, or disable while another enabled extension requires it) / `EXT_QUARANTINED` / `EXT_ROLLBACK_BLOCKED` / `EXT_GRANTS_REQUIRED` (a reload needs new grants, `06` §6.6) | extension lifecycle | no |
| `SCHEMA_TOO_NEW` / `MIGRATION_FAILED` | persisted data versions | no |
| `CONFIRMATION_EXPIRED` | preview token expired or staged bytes changed | yes (preview again) |
| `DAEMON_CONFLICT` | another kernel owns the lock | no |
| `HOME_INVALID` | the home folder holds other files but no `kvman.db` (`03` §3.9) | no |
| `HOST_FORBIDDEN` | bad `Host` or `Origin` | no |
| `INTERNAL` | unexpected error (details in the log) | yes |

Extension codes used across the plan: `agent/SESSION_CLOSED`, `agent/CONTEXT_TOO_LARGE`, `agent/COMPACT_FAILED`, `agent/TOOL_DENIED`, `agent/UNKNOWN_TOOL`, `agent/REVIEW_REJECTED`, `agent/NOT_A_GUARD`, `agent/SECTION_LIMIT`, `agent/SESSION_NOT_FOUND`, `agent/DEPTH_EXCEEDED`, `shell/TIMEOUT`, `interviewer/BUSY`, `fs/NOT_FOUND`, `pdf/NOT_FOUND`.

## 13.3 Logging

- Pino JSON to `~/.kvman/logs/kernel.log`, rotated daily and at 50 MB, 14 files kept.
- Every line has `correlationId`, and where relevant `messageId`, `type`, `extension`, `workspaceId`, `lane`, `attempt`, `durationMs`.
- **Never logged**: message payloads, config values, secrets, authorization data, request bodies, raw provider errors. Extension `ctx.log` output goes through the same redaction (known secret fields, bearer tokens, URLs with credentials).
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

XSS payload matrix for Markdown and all text components (scripts, event attributes, SVG/MathML, encoded `javascript:`, `data:` URLs, malformed tables, fenced HTML, external link `rel`); Host/Origin rejection including DNS-rebinding hosts; event stream cross-origin rejection (`Sec-Fetch-Site`, no CORS); widget isolation (no parent DOM access, no cross-extension calls, no network); capability denial for every `ctx` surface; `CALLER_NOT_ALLOWED` for user-only and internal commands from extensions, processes (job tokens), and widget bridges; cross-extension separation (views targeting foreign user-only types without `calls`, foreign events without a subscription grant, blobs without a ref or hand-over, admin-only kernel queries); grant dialog cannot be opened with a forged preview or confirmed without a click; contributions placed in slots that do not accept their kind, extension content in shell-only zones, and `frame.*` names are rejected; a public component with its own command action is rejected, and an action passed into a component is checked against the passing view's owner; bidirectional-override text in the grant dialog is neutralized; a preset that hides the Extensions page still shows it in the apply dialog and under "Show hidden pages"; a notification whose button targets a grant command, a foreign user-only or internal command, or a type outside the sender's own and granted `calls` is rejected, and one sent by an extension never shows as kvman; sandboxed install-time loader; sandbox OS denials; job-token scope (a delegated token reaches only `allowTypes` that the requesting agent may send); a dev version enabled in a preview workspace is never granted `process`, `network`, `kernel.admin`, or lower isolation; a reload that needs new capabilities fails `EXT_GRANTS_REQUIRED` unless confirmed in the grant dialog; the shell refuses to be framed by any origin but its own; trust gate change detection; secret redaction in logs, traces, presets, and exports; blob content-type spoofing; a guard extension enabled together with the agent holds every tool call until it registers (no call runs unguarded); `access: 'extensions'` types refuse people and views, and `access: 'user'` types refuse processes and widget bridges; `agent.send` from an extension fails `CALLER_NOT_ALLOWED`; a widget cannot subscribe to another extension's live events; `kernel.dev.file.*` refuses `..`, absolute paths, and symlinks, and `kernel.dev.build` cannot write outside `dist/`; a POST with a foreign `Origin` is refused while one without `Origin` is accepted; a crash while writing `secrets.json` leaves the old or the new file, never a partial one; a package whose tarball differs from the preset's `integrity` fails `PRESET_INTEGRITY_MISMATCH`; `local-guard` asks the person before `curl http://127.0.0.1:<port>/api/v1/commands/<type>` runs and allows an ordinary command at once; a sandboxed extension host, the install-time loader, and a builder test process cannot load `node:sqlite` (through `import`, `require`, or `process.getBuiltinModule`) and cannot open `kvman.db`; a builder project's test cannot write a file, start a process or worker, or load an addon, and the project's `tsconfig.json` cannot change the compiler options.
