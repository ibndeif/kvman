# 10 — Core Extensions

All core extensions are ordinary extensions: installed from `builtin:` sources, versioned, disableable, and replaceable through contracts. `agent` is in `09`, `builder` in `11`.

Every core extension ships `en` and `ar` catalogs (`ext.registerTranslations`), uses `$t` keys for every label, and sends notices and problems as keys with parameters (`08` §8.16). Their UI uses only the contribution kinds and slots of `08` §8.4.

Two packs:
- **Agent pack**: `agent`, `llm-providers`, `shell`, `fs`, `todo`, `interviewer`, `rules`, `skills`, `persona`, `local-guard`.
- **Platform pack**: `settings`, `presets`, `extensions`, `inspector` (included in every built-in preset).

`builder` (the Extension Builder, `11`) ships with kvman too but belongs to no pack; only the Extension Builder preset enables it.

**Prompt sections** (`09` §9.6): `rules`, `skills`, `persona`, `interviewer`, `fs`, and `todo` put their text into the agent's prompt with `agent.prompt.section.set`. Each requests `calls: ['agent.prompt.section.*']` and subscribes to `agent.activated`; each sends its sections on `agent.activated`, on its own `kernel.extension.enabled` / `.reloaded`, and whenever its data changes, and removes a section when it has nothing to say.

**Page and nav ids** (what presets hide, order, and relabel): every page below is listed with its id and route; each has a nav item `<ns>.nav-<page>` unless stated otherwise.

## 10.1 `llm-providers` — LLM provider implementations

LLM access itself is a kernel service (`05` §5.11, `03` §3.12): the kernel owns the model registry, defaults, the call path, and usage. This extension only **implements providers** on top of it.

- Package `@kvman/llm-providers`, namespace `llm-providers`. The only package that depends on pi-ai (package name and version pinned in ADR 0003, milestone M0.5).
- Capabilities: `network`, own config and secrets. Derived: `provides-llm` for every provider it registers.
- Registers with `ext.registerProvider` one provider per pi-ai provider (`anthropic`, `openai`, `google`, `openrouter`, …), each with `complete` (pi-ai streaming mapped to `ctx.delta`), `countTokens` where pi-ai has a tokenizer, and `status`. Known models are registered with `ext.registerModel` (window, max output, prices, capabilities).
- Provider `openai-compatible`: the user configures endpoints (`{ name, baseUrl, apiKey (secret) }`) in this extension's config; `listModels` reads each endpoint's model list, with model IDs `<endpoint>/<model>`.
- Errors are mapped to the kernel's `LLM_*` codes with `llmProblem` (retryable failures carry the provider's `retry-after`).

| Kind | Type | Notes |
|---|---|---|
| command | `llm-providers.login.start` | `{ provider }` → starts an OAuth-style login supported by pi-ai; stores it as a pending login (URL, device code) with the prompt pattern |
| command | `llm-providers.login.finish` | access `user`: submits the code the person pasted; stores the token in this extension's secrets |
| command (internal) | `llm-providers.login.expire` | access `internal`: `onAbort` of a pending login |
| query | `llm-providers.logins.list` | pending logins (bound by its login panel) |

- Config: global credentials (secrets) and base URLs per provider; workspace `allowedProviders?`.
- UI: its settings section (generated from its config: keys as masked fields, base URLs, compatible endpoints) and its own provider panel in the `settings.providers` slot with "Log in" buttons (its own commands) and the pending login (also shown in `frame.overlay` while pending). The Models page itself belongs to `settings` (§10.7).
- Other provider extensions (`@acme/ollama`, a company gateway) register their own providers the same way; nothing in the kernel or in this extension changes.

## 10.2 `shell` — processes and the bash tool

- Namespace `shell`. Capabilities: `process`, `files.read`, `calls: ['agent.inject']`, `ui`.

| Kind | Type | Notes |
|---|---|---|
| command | `shell.exec` | agent tool (the bash tool). `{ command, title, description?, runMode: 'sync' \| 'async' (default sync), timeoutMs?, allowTypes?: string[] }`; `allowTypes` is declared in `agentTool.hiddenFields`, filled by the agent, and never shown to the model. Sync default 60 s, async default 24 h. Lane `job:<jobId>` (lane template `'job:{{ $message.id }}'`: the job id is the command's message id). Handler `timeoutMs: 86_400_000` (the maximum): the real limit is the payload's `timeoutMs`, enforced by killing the process group. |
| command (internal) | `shell.job.finish` | the `onExit` of async jobs (`03` §3.7): records the result, publishes `shell.job.completed`, and injects it into the session |
| command | `shell.kill` | `{ jobId }` → kills the process group |
| query | `shell.jobs.list`, `shell.job.get`, `shell.job.log.get` | `log.get` supports `tail` lines; full log from the finalized blob |
| event | `shell.job.started`, `shell.job.completed` | durable |
| event (live) | `shell.output.written:<jobId>` | chunk `text`: coalesced process output |

- Runs `bash -c` through `ctx.process.spawn` in the workspace directory with `PATH=<system>:~/.kvman/bin` (the `kv` shim last) and a **delegated** job token `{ calls: allowTypes ?? [], delegate: true, context }` (`03` §3.7, `12` §12.4): the process may call exactly the listed types that the requesting actor (the agent, through its `tools` capability) may call, so `shell` never holds tool capabilities itself. Without `allowTypes` the process gets no `kv` access. Honest non-sandbox: the shell is not jailed; the UI and prompt say so.
- **Sync**: spawns and waits inside one `ctx.step('run', …)` (not retry-safe); reply `{ exitCode, output (last 2,000 lines / 50 KB), truncated, logBlobId, durationMs }`. A sync job still running at its `timeoutMs` is killed and fails `shell/TIMEOUT` with its log reference.
- **Async**: spawns with `detached: true, onExit: 'shell.job.finish'` inside `ctx.step('spawn', …)` and replies immediately `{ jobId, status: 'running' }`. When the process ends, `shell.job.finish` records the result on the job, publishes `shell.job.completed`, and, if the message context has a `sessionId`, sends `agent.inject {sessionId, text: <job-result summary>}` with the send option `idempotencyKey: 'job-result:<jobId>'`.
- Limits: 32 concurrent async jobs per session (`context.sessionId`), 10 MB log cap with drain-and-discard, SIGTERM then SIGKILL.
- A sync job interrupted by a kernel crash is redelivered, finds its step `started`, and fails `EFFECT_INDETERMINATE` with its log reference: a command never runs twice. An async job killed by a kernel restart finishes through `shell.job.finish` with reason `kernel-restart`.
- UI: renderer for `shell.exec` tool results (JobCard with live tail and "open full log"), `agent.chat.sidebar` panel "Jobs", kill action on entity `shell.job`.

## 10.3 `fs` — workspace files

- Namespace `fs`. Capabilities: `files.read`, `files.write`.
- Read tools (queries): `fs.file.get {path, offset?, limit?}`, `fs.dir.list {path, depth?}`, `fs.files.search {pattern}` (a glob). Write tools (commands): `fs.write {path, content}`, `fs.edit {path, oldString, newString, replaceAll?}` (exact match; fails on multiple matches unless `replaceAll`), `fs.dir.create {path}`, `fs.remove {path, recursive?}`.
- All through `ctx.files`: realpath jail, `WORKSPACE_ESCAPE`, `~/.kvman` refused, `.kvman/` trust-gated. A missing path fails `fs/NOT_FOUND`.
- Prompt section `files` (order 50): the file policy (paths are relative to the workspace, `.kvman/` is gated, how to edit). Config `showHidden`.
- Presets may disable write tools (the Assistant preset keeps the read tools `fs.file.get`, `fs.dir.list`, `fs.files.search` only).

## 10.4 `todo` — session todos

- Namespace `todo`. Collection `todos { id, sessionId, text, status: open|doing|done, order, createdAt }`.
- Agent tools: `todo.create`, `todo.update`, `todo.complete`, `todo.remove`; query `todo.list {sessionId}`.
- Prompt section `open-todos` (order 40) per session: the open and doing items, sent again after every change to that session's items and removed when none are open.
- Subscribes: `agent.session.forked` → copies open/doing items (idempotent by `(from, to)`); `agent.session.deleted` → deletes its items.
- UI: `agent.chat.sidebar` panel with the checklist.

## 10.5 `interviewer` — asking the user

- Namespace `interviewer`. Capability `ui` (for `ui.notify`). Built with `ext.registerPrompt` (`05` §5.5); it is the reference example of the prompt pattern.
- Agent tool `interviewer.ask { question, choices?, allowText?, allowReject? }` with `agentTool: { waitMs: 900000, interactive: true }` (15 min).
- Handler: rejects if another question is open for the session (`interviewer/BUSY`: the prompt's `oneOpenPer` is `session:<id>`); stores the question in its `questions` collection with `sessionId` and `rootSessionId` from the message context (`09` §9.9); publishes `interviewer.question.asked`; sends `ui.notify`; returns `ctx.defer({ onAbort: 'interviewer.question.expire' })`. The notification has `key: question:<id>`, `attention: true`, and the prompt's deadline as `expiresAt`; answering or expiring calls `ctx.ui.dismiss` for it (`08` §8.11).
- UI: a panel in `agent.chat.prompt` bound to `interviewer.questions.list {sessionId: $slot.sessionId}`, which returns the open questions whose `rootSessionId` equals that id (so a subagent's question appears in the thread the person is looking at) (live on `interviewer.question.*`), rendered with its own composite component `interviewer.questionCard` (question, choice buttons, optional text, Reject). It is registered at install and visible only while a question is open: the reference example of runtime UI (`08` §8.10).
- `interviewer.question.answer` / `interviewer.question.reject` (access `user`) validate the answer, call `ctx.reply(questionId, { answer } | { rejected: true })`, close the question, and publish `interviewer.question.closed`. A late second answer fails `REPLY_NOT_AWAITING`.
- Cancel or deadline: the kernel sends `interviewer.question.expire` (internal), which closes the question; the card shows "no longer active".
- Prompt section `guidance` (order 52): ask only for ambiguity, destructive actions, or missing choices; one question per call; in bash mode set `timeoutMs: 900000` on the outer bash call.

## 10.6 `rules`, `skills`, `persona`

| Extension | Reads | Prompt section | Refreshed when | Other |
|---|---|---|---|---|
| `rules` | `<ws>/.kvman/rules/*.md` (trust-gated) + global rules (kv) | `rules` (order 60) | `agent.turn.started` (re-reads the files, sends only if the text changed), global rules are edited, `kernel.trust.changed` | query `rules.list`; page `rules.global` at `/rules` to edit global rules |
| `skills` | `<ws>/.kvman/skills/<name>/SKILL.md` + frontmatter (trust-gated) + global skills | `skills` (order 55): index of skill names and descriptions (progressive disclosure) | `agent.turn.started` (same check), global skills are edited, `kernel.trust.changed` | agent tool (query) `skills.skill.get {name}` returns the full skill text |
| `persona` | config `{ displayName, description, tone }` (workspace): who the agent is and how it speaks | `persona` (order 70) | `kernel.config.changed` for itself | settings form |

Untrusted workspace files are simply skipped (the section then holds only the global part, and a notice suggests Trust), never an error that blocks a turn. There is no file watcher: an edited rule or skill file reaches the prompt from the next turn at the latest (the `agent.turn.started` check may or may not finish before that turn's first step reads the sections).

## 10.7 `settings`

- Capability `kernel.admin`.
- Pages: `settings.models` at `/settings/models` (providers from `kernel.llm.providers.list` with status, models from `kernel.llm.models.list`, workspace and global defaults per purpose set with `kernel.llm.defaults.set`, usage from `kernel.llm.usage.get`; it places the slot `settings.providers` (`accepts: ['panel']`), where provider extensions put their own login and status panels) and `settings.general` at `/settings`, whose view is the built-in `settingsSections` component (`08` §8.8): one section per enabled extension that registers config (id `settings.section.<ns>`, hideable by presets), each a form generated from its config schema or the extension's own settings view, global and workspace scopes shown separately, secrets as masked fields with explicit Clear, revision-aware saves (stale → reload prompt).
- Uses `kernel.config.get/set`, `kernel.secret.set/clear`, and the `kernel.llm.*` queries and `kernel.llm.defaults.set`.
- Nav: group `settings.group` ("Settings") with `settings.nav-general` and `settings.nav-models`. Language and theme are **not** here: they are personal preferences in the shell's kvman menu (`08` §8.3), so they work even when `settings` is hidden or disabled.

## 10.8 `presets`

- Capability `kernel.admin`.
- Pages: `presets.catalog` at `/presets` (catalog, current workspace preset, import, apply, save as, export) and `presets.editor` at `/presets/current` (editor: frame layout (sidebar and status bar modes), the order of items in every frame region with sidebar separators, show/hide for every contribution, labels per language, app title/icon/accent/home, the preset's own catalogs, workspace config (saved with `kernel.config.set`, `07` §7.5), low-code pages with a JSON editor that validates live through `kernel.validate` and previews the page).
- Apply always shows the preview (`kernel.preset.apply.stage`: extensions to install with capabilities in plain words, what will change) and takes one confirmation: the Apply button opens the shell's grant dialog (`08` §8.13), whose Confirm sends `kernel.preset.apply` (access `user`).

## 10.9 `extensions`

- Capability `kernel.admin`.
- Pages: `extensions.list` at `/extensions` (name, version, source, digest, isolation, status: active / disabled / quarantined / needs approval, capabilities), `extensions.detail` at `/extensions/:name` (no nav item; types it provides, contributions and the slots they go into, public components and which enabled extensions require them, languages it ships, versions with rollback, data size, uninstall with keep/delete data), install dialog (source → preview → capability disclosure → confirm; ends installed but not enabled; offers "enable in this workspace", which opens the shell's grant dialog; its Confirm sends `kernel.extension.enable` with the grants, isolation included, as the user).
- Shows each extension's isolation (built-in `shared`, others `sandboxed` unless the user granted a lower level) with the trusted-code notice for `shared`/`dedicated`. Changing isolation (either way) is `kernel.extension.enable` with new grants through the grant dialog. An installed upgrade that waits for new grants shows "needs approval" with an Approve button that opens the grant dialog for `kernel.extension.reload {grants}`.

## 10.10 `inspector`

- Capability `kernel.admin`.
- Pages: `inspector.traces` at `/inspector/traces` (search by correlation, session, type; tree view of a trace with timings, states, attempts, problems), `inspector.dead` at `/inspector/dead` (dead letters with retry or discard), `inspector.live` at `/inspector/live` (live traffic sample, lane depths, host utilization), `inspector.processes` at `/inspector/processes`; nav group `inspector.group`.
- Uses `kernel.trace.get`, `kernel.messages.list`, `kernel.metrics.get`, `kernel.processes.list`, `kernel.message.retry/discard`.
- Payloads are shown only on explicit reveal (`kernel.trace.get {reveal: true}`, admin), with secrets redacted.

## 10.11 `local-guard` — shell commands that reach kvman itself

The localhost API has no authentication (`13` §13.6), so a shell command can call kvman's HTTP API or socket as the person. A prompt-injected model could use that to answer prompts or confirm grants. `local-guard` is a **guard** (`09` §9.5) that asks the person first. It is also the reference example of a guard.

- Package `@kvman/local-guard`, namespace `local-guard`, in the agent pack and the **Coding Agent** preset (the other built-in presets have no shell tool). Built-in, so it runs `shared`.
- Capabilities: `calls: ['agent.guards.set', 'agent.tool.call.review']`, `ui`. Derived: subscriptions to `agent.activated`, `agent.tool.call.created`, and `agent.tool.call.completed`. Because it holds both the subscription and the review `calls`, the agent treats it as a guard from the moment it is enabled, before it registers (fail closed, `09` §9.5).
- Registers one guard: `{ name: 'local-api', title: '$t.guard.title', description: 'Asks before a shell command reaches kvman itself.', tools: ['shell.exec'] }`, on `agent.activated` and on its own enable or reload.
- **Review** of each `shell.exec` call: it reads the kernel's port and home folder once per invocation with `kernel.health.get` (`03` §3.8) and checks the command line (case-insensitive) for any of:
  - the kvman port as `:<port>` together with `127.0.0.1`, `localhost`, `0.0.0.0`, or `[::1]`;
  - the home folder path, `~/.kvman`, `$HOME/.kvman`, or `kernel.sock`;
  - `KVMAN_TOKEN` or `KVMAN_SOCKET`.

  No match → `allow` at once. A match → it asks the person with its own prompt (`ext.registerPrompt`, `05` §5.5): a panel in `agent.chat.prompt`, keyed by `rootSessionId`, that shows the command and the matched part, with Allow and Deny (`local-guard.question.answer`, access `user`), plus an `attention` notification. The answer becomes its review (`allow`, or `deny` with reason "The person refused a command that reaches kvman itself").
- It closes an open prompt when it receives `agent.tool.call.completed` for that call (cancelled, or denied by another guard).
- It does not inspect `kv` calls: the `kv` shim reaches only the types its delegated token allows (`03` §3.7), never user-only or grant commands.
- Honest limit: the check matches text, so an obfuscated command (encoded strings, variables built at runtime) can pass it. It narrows the gap; it does not close it. The risk banner and `13` §13.6 say so.

