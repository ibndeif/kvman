# 09 — The Agent Extension

`@kvman/agent` (namespace `agent`, implements `agent@1`) is the AI agent application. It uses only the public extension API. An alternative agent can replace it by implementing `agent@1`. The turn state machine (§9.3) is a pure module inside this extension (`src/turn/`: state and message in, new state and outgoing messages out), tested with fast-check against a reference model (`15` R4).

## 9.1 Data model

| Storage | Name | Content |
|---|---|---|
| collection | `sessions` | `{ id, workspaceId, title, status: active\|closed, model: {provider, id, thinking}, toolMode, parentId?, depth, hidden, totals: {input, output, costUsd}, contextPercent, createdAt, updatedAt }` indexes `[status, updatedAt]`, `[parentId]` |
| log | `history:<sessionId>` | entries (below) |
| kv | `turn:<sessionId>` | turn state machine (below) |
| collection | `childRuns` | `{ childSessionId, parentSessionId, parentCommandId, budgetTokens, startedAt }` |
| collection | `sections` | prompt sections registered by other extensions (§9.6): `{ key: '<owner>|<id>|<sessionId or "">', owner, id, sessionId?, title, content, order, updatedAt }` indexes `[sessionId]`, `[owner]` |
| collection | `guards` | registered guards (§9.5): `{ id: '<owner namespace>.<name>', owner, name, title: Text, description, tools: string[], registeredAt }` index `[owner]`; plus one doc per guard extension that has registered at least once: `{ id: '<owner namespace>', owner, registered: true }` |

History entries:
```ts
type Entry =
  | { kind: 'user'; text: string; attachments?: BlobRef[]; source: 'user' | 'inject' | 'parent'; at }
  | { kind: 'assistant'; text: string; thinking?: string; toolCalls?: ToolCall[]; usage; costUsd?; model; turnId; round;
      runId: string;                 // the agent.step message id: the live-event run it replaces (02 §2.3)
      at }
  | { kind: 'toolResult'; toolCallId: string; tool: string; ok: boolean; text: string; fullBlobId?: string; at }
  | { kind: 'summary'; coversThroughSeq: number; text: string; tokens: number; at }
  | { kind: 'notice'; level: 'info' | 'warning' | 'error'; code?: string; params?: Json; text: string; at };
                                   // shown from the catalog by code + params; text is the English fallback (08 §8.16)
```

Turn state:
```ts
type TurnState = {
  turnId?: string;                 // id of the agent.send (or agent.child.send) that started the turn
  stepMessageId?: string;          // id of the agent.step currently queued or running (for cancel)
  status: 'idle' | 'running' | 'awaiting-tools' | 'cancelling';
  round: number;
  calls: Record<string /*toolCallId*/, ToolCallState>;   // this round's tool calls (§9.5)
  lastPromptSeq?: number;          // last history seq included in the latest LLM call
  deadlineAt?: number;
  compactRequested?: boolean;
  usage: { input: number; output: number };
};

type ToolCallState = {
  tool: string; args: Json; dangerous: boolean;
  state: 'reviewing' | 'awaiting-person' | 'running' | 'done';
  waitingFor?: string[];           // state 'reviewing': guard ids ('<ns>.<name>') that have not reviewed yet, or a bare
                                   // '<ns>' for a guard extension that has not registered yet (§9.5)
  messageId?: string;              // the tool command, once sent (state 'running'; used by cancel)
  askedAt?: number;                // when the person was asked (state 'awaiting-person')
};
```

## 9.2 Messages

| Kind | Type | Lane | Purpose |
|---|---|---|---|
| command | `agent.session.create` | — | `{ workspaceId, title?, model?, toolMode? }` → `{ sessionId }` |
| command | `agent.chat.start` | — | access `user`: `{ workspaceId, text, attachments?, model?, toolMode? }` → `{ sessionId }`: creates a session, appends the first user entry, and starts its turn in one unit of work (the `/chat` page's composer, §9.11) |
| command | `agent.send` | `session:<id>` | access `user`: the person's input `{ sessionId, text, attachments? }`; only people can add `user` entries (extensions use `agent.inject`) |
| command (internal) | `agent.child.send` | `session:<id>` | the parent's prompt to a child session (§9.9); entry source `parent` |
| command | `agent.inject` | `session:<id>` | access `extensions`: extension input `{ sessionId, text, source, startTurn?: boolean /* default true */ }` (senders dedupe with `ctx.send`'s `idempotencyKey` option) (e.g. async job finished); starts a turn when the session is idle unless `startTurn: false`; an inject into a child session whose run has ended goes to its parent (up to the root), with the text prefixed "From a subagent's job:" |
| command (internal) | `agent.step` | `session:<id>` | one LLM round |
| command (internal) | `agent.tool.record` | `session:<id>` | continuation for tool replies |
| command | `agent.approval.answer` | `session:<id>` | access `user`: `{ sessionId, toolCallId, decision: 'allow' \| 'deny' }` for a dangerous tool call that no guard covers (§9.5) |
| command | `agent.tool.call.review` | `session:<id>` | access `extensions`: a guard's decision `{ sessionId, toolCallId, guard: string /*name*/, decision: 'allow' \| 'deny', reason?: string }` (§9.5) |
| command (internal) | `agent.tool.review.release` | `session:<id>` | `{ sessionId, owner, keep? }`: re-resolve the reviews a guard extension owes after it registers or is disabled (§9.5) |
| command | `agent.guards.set` | `guards:<owner>` | access `extensions`: `{ guards: Array<{ name, title: Text, description, tools?: string[] }> }` replaces all of the sender's guards in the workspace; `[]` removes them (§9.5) |
| command | `agent.prompt.section.set` / `agent.prompt.section.remove` | `section:<owner>.<id>:<sessionId or ->` | access `extensions`: `{ id, title, content, order?, sessionId? }` / `{ id, sessionId? }` (§9.6) |
| command | `agent.cancel` | none (control) | cancel the running turn; slash `/cancel` |
| command (internal) | `agent.turn.finalize` | `session:<id>` | finalize a cancellation |
| command (internal) | `agent.turn.expire` | `session:<id>` | timer at the turn deadline |
| command | `agent.compact` | `session:<id>` | manual compaction; slash `/compact` |
| command | `agent.session.export` | — | `{ sessionId, format: 'markdown' \| 'json' }` → `{ blobId }`: the whole history (every entry, read in ranges) as a file |
| command | `agent.session.rename` / `.set-model` / `.set-tool-mode` / `.close` / `.delete` / `.fork` | `session:<id>` | lifecycle |
| command | `agent.child.run` | `session:<parent>` | subagent (agent tool) |
| command (internal) | `agent.retention.run` | — | scheduled daily |
| query | `agent.history.get {sessionId}` → `{ entries, omitted }`: the newest `historyWindow` entries (default 2,000), oldest first, and how many older ones are not included; the thread shows "N earlier entries" with Export (`agent.session.export`). No pagination | — | reads |
| query | `agent.sessions.list`, `agent.session.get`, `agent.tools.list`, `agent.approvals.list`, `agent.reviews.list {sessionId}` (calls waiting for guards, with guard titles) | — | reads |
| query | `agent.prompt.sections.list {sessionId?}`, `agent.guards.list`, `agent.slash.list {sessionId?}` | — | reads (§9.5, §9.6, §9.11) |
| event | `agent.session.created/updated/closed/deleted/forked`, `agent.turn.started/completed/cancelled/failed`, `agent.compacted`, `agent.approval.requested/resolved` | — | durable |
| event | `agent.activated` `{}` | — | durable; published by the agent's own subscription to `kernel.extension.enabled` / `.reloaded` when the name is its own, for that workspace: section owners and guards (re)register (§9.5, §9.6) |
| event | `agent.tool.call.created` `{ sessionId, turnId, toolCallId, tool, args, dangerous, guards: string[] }` | — | durable; published only when at least one guard covers the call (§9.5) |
| event | `agent.tool.call.completed` `{ sessionId, turnId, toolCallId, tool, outcome: 'ok' \| 'error' \| 'denied' \| 'cancelled', deniedBy?, reason?, summary? }` | — | durable; every call, guarded or not |
| event | `agent.entry.appended` `{ sessionId, seq, kind }` | — | transient (UI refresh) |
| event (live) | `agent.tokens.generated:<sessionId>`, `agent.thinking.generated:<sessionId>` | — | chunk `text`: answer and thinking text of the running step, relayed from `ctx.llm.complete` |

Capabilities: `llm`, `tools` (every agent tool enabled in the workspace, `05` §5.7), `ui`. `kernel.cancel` for its own messages needs no capability. It subscribes only to its own and `kernel.*` events (`kernel.extension.enabled`, `.reloaded`, `.disabled`), which need no grant.

**Handler timeouts** (`02` §2.9): `agent.step` declares `timeoutMs: 600_000`, because one LLM call may stream for minutes; `agent.compact` declares `timeoutMs: 180_000` (above `compactionTimeoutMs`, §9.10); every other agent handler uses the defaults.

**The agent's API for other extensions** (part of the `agent@1` contract, so an alternative agent must offer it too): prompt sections (§9.6), guards and tool-call events (§9.5), `agent.inject`, and the session events. Extensions extend the agent only through these; the agent never calls them and does not know which ones exist.

## 9.3 Turn step machine

```
agent.send / agent.chat.start / agent.child.send / agent.inject ──▶ append user entry (source user / parent / inject)
               status idle? (and, for inject, startTurn ≠ false)
                 ──yes──▶ turnId = message id · status running · deadline timer · send agent.step {turnId, round 0}
               └─no (running / awaiting-tools)──▶ entry becomes steering input for the next step
               └─no (cancelling)──▶ entry is kept; agent.turn.finalize starts a new turn for it (§9.4)
agent.step {turnId, round}
   guard: turn matches and not cancelling
   read prompt sections (workspace + this session) · list enabled tools · build prompt and preflight (§9.6)
   r = ctx.llm.complete {purpose: chat, model: session.model, …,
                         live: {text: agent.tokens.generated:<sid>, thinking: agent.thinking.generated:<sid>}}
                                                                 (journaled; no double call on redelivery)
   append assistant entry (text, toolCalls, usage, runId = this message id) · update session totals · lastPromptSeq
   no tool calls:
       unanswered user/inject entries after lastPromptSeq? → send agent.step (new round, same turn)
       else → status idle · publish agent.turn.completed · if compactRequested or over threshold → send agent.compact
   tool calls: status awaiting-tools · for each call: ADMIT (below)
       round ≥ maxToolRounds → append notice, idle
ADMIT(call)
   tool not in this step's enabled tool list → state done · toolResult error agent/UNKNOWN_TOOL (with the list of names)
   args fail the tool's input JSON Schema     → state done · toolResult error VALIDATION_FAILED (issues, for the model)
     (both: publish agent.tool.call.completed {error}; no guard sees them)
   covering = kernel.subscribers.list {workspaceId, type: agent.tool.call.created} filtered to guard
              extensions (§9.5); per extension: its registered guards whose tools match, or '<ns>' if it never registered
   none, not dangerous → EXECUTE
   none, dangerous     → state awaiting-person · publish agent.approval.requested {sessionId, rootSessionId, …}
                         · ui.notify (attention, key approval:<toolCallId>, route of the root session)
   some                → state reviewing · waitingFor = their ids · publish agent.tool.call.created {…, guards}
agent.tool.call.review {sessionId, toolCallId, guard, decision, reason}          (access: extensions)
   check: turn active · call reviewing · '<source ns>.<guard>' in waitingFor      else agent/REVIEW_REJECTED
          (a bare '<source ns>' entry is resolved by the sender's registration first, below)
   deny  → state done · append toolResult error agent/TOOL_DENIED (guard title, reason) · publish agent.tool.call.completed {denied}
   allow → remove from waitingFor · empty → EXECUTE
agent.tool.review.release {sessionId, owner, keep?: GuardId[]}                   (internal, §9.5)
   in every reviewing call: replace the entries of owner ('<ns>' and '<ns>.*') by the ids in keep that cover
   the call (none when the guard extension was disabled or registered []) · any waitingFor now empty → EXECUTE
agent.approval.answer {toolCallId, decision}                         (access: user, from the approval panel)
   check turn active and call awaiting-person · publish agent.approval.resolved
   allow → EXECUTE · deny → state done · toolResult error agent/TOOL_DENIED · publish agent.tool.call.completed {denied}
EXECUTE(call)
   query tool   → r = ctx.query <tool type> {args} (within its timeoutMs and the turn deadline) · append toolResult
                  (truncated like any result) · state done · publish agent.tool.call.completed, all in this handler
   command tool → send <tool type> {args} onReply agent.tool.record, context {sessionId, rootSessionId, turnId, toolCallId},
                  deadline = min(agentTool.waitMs, turn deadline) · state running · messageId
agent.tool.record {reply, context}
   guard turn · append toolResult (truncate for the model, full text to a blob if large) · state done
   publish agent.tool.call.completed {ok | error, summary}
after every handler above: no call reviewing, awaiting-person, or running → send agent.step round+1 (or finalize if cancelling)
```

Every box is a short handler that commits its own unit of work, so:
- a crash resumes from the last committed step (redelivery; the LLM call is re-awaited, not repeated);
- the UI sees each entry as it is committed;
- tools run in parallel in their own lanes;
- waiting for a slow tool, a guard, an approval, or a person costs no worker capacity.

## 9.4 Steering, cancel, deadlines

- **Steering**: a user message arriving mid-turn is appended immediately and included in the next `agent.step` prompt. No special queue exists: the history is the queue.
- **Cancel**: `agent.cancel {sessionId}` has no lane so it is not stuck behind the running step. It reads the turn state and sends `kernel.cancel {messageId}` for `stepMessageId` and for the `messageId` of every running call. Cancelling by message ID reaches everything each of them caused (`02` §2.9): the in-flight LLM call, tool commands and their processes, and deferred tools such as `interviewer.ask`, whose replies become `CANCELLED` tool results. It then sends `agent.turn.finalize` in the session lane, which sets `status: 'cancelling'` → appends a notice, closes open approvals (`agent.approval.resolved`), marks every call still reviewing or awaiting the person `done` with outcome `cancelled` (`agent.tool.call.completed`; later reviews fail `agent/REVIEW_REJECTED`), and sets `idle`. Tool results that arrive for a finalized turn are recorded in history but start no new round. User entries that were already in history when the cancel was requested are not answered again automatically. Entries appended **after** the cancel request (the person typed while the turn was stopping, e.g. "stop, do X instead") start a new turn as soon as finalize sets `idle`. Cancelling an idle session is a no-op; a second cancel while `cancelling` is a no-op.
- **Deadline**: `agent.turn.expire` fires at `deadlineAt` (default 30 min per turn, config) and behaves like cancel with reason `timeout`.

## 9.5 Tools

- **Discovery**: every command or query with `agentTool` metadata whose extension is enabled in the workspace and not disabled by the preset (`disable: ['<type>']`): the agent reads `kernel.schema.get {workspaceId}` and removes the types listed in the applied preset's `extensions[*].disable` (`kernel.preset.current.get`). The kernel's `tools` check uses the same set (`05` §5.7).
- **Query tools and command tools**: a query tool (read-only) runs inline in the agent's handler once ADMIT and every covering guard allow it, and its result is in history in the same step; a command tool runs in its own lane and replies through `agent.tool.record` (§9.3).
- **Tool modes** (session setting, default from workspace config):

| Mode | What the model sees | How other tools are reached |
|---|---|---|
| `bash` | one tool `bash {command, title, description?, runMode?, timeoutMs?}` → `shell.exec` | enabled agent tools are CLIs: `kv pdf.translate --file-id … --lang ar`; their one-line summaries are in the system prompt; `kv help <type>` prints details |
| `direct` | one tool per enabled agent tool (`pdf_translate`), JSON schema from its input schema | if more than 64 tools, a single `call {tool, args}` tool with a discriminated schema |

- **Tool names in `direct` mode**: providers accept `^[a-zA-Z0-9_-]{1,64}$`. The model-facing name is the type with every `.` replaced by `_` (unambiguous: type names never contain `_`, `02` §2.4); a name longer than 64 characters becomes its first 55 characters, `_`, and the first 8 hex characters of the SHA-256 of the full type. The agent builds this mapping for each step and maps the model's tool calls back through it; a name not in the mapping is `agent/UNKNOWN_TOOL`.

- In `bash` mode the agent adds `allowTypes: <enabled agent tool types>` to the `shell.exec` payload (not visible to the model). `shell` spawns the process with a delegated token `{ calls: allowTypes, delegate: true }`, so the process may call exactly the tools that are enabled and that the agent may send (`03` §3.7), with `context.sessionId` set.
- `title` is required on the bash tool (it labels the job in the UI); a missing title is a validation error returned to the model.
- **Results**: tool replies are converted to text; results over `resultLimit` (default 50 KB / 2,000 lines) keep the tail for the model plus a note pointing to the full blob.

### Guards: who may block a tool call

Policy is not built into the agent. Any extension can become a **guard**: it registers with the agent, receives an event for every tool call it covers, and answers allow or deny. The agent runs the call only when every covering guard has allowed it.

```ts
// a guard extension (e.g. a company policy extension)
ext.requestCapability('calls', { types: ['agent.guards.set', 'agent.tool.call.review'], reason: 'Reviews tool calls' });
const register = (ctx) => ctx.send('agent.guards.set', { guards: [
  { name: 'shell-policy', title: '$t.guard.title', description: 'Blocks dangerous shell commands.', tools: ['shell.exec'] } ] });
ext.subscribe('agent.activated', { description: 'Register as a guard.', handle: async (_, ctx) => register(ctx) });
ext.subscribe('kernel.extension.enabled', { description: 'Register when enabled.',
  handle: async (e, ctx) => { if (e.name === '@acme/policy') register(ctx); } });
ext.subscribe('agent.tool.call.created', { description: 'Review one tool call.', lane: 'session:{{ $payload.sessionId }}',
  handle: async (call, ctx) => {
    if (!call.guards.some((g) => g === 'policy' || g === 'policy.shell-policy')) return;   // not waiting for us
    const bad = /rm -rf \/|mkfs/.test(call.args.command);
    ctx.send('agent.tool.call.review', { sessionId: call.sessionId, toolCallId: call.toolCallId,
      guard: 'shell-policy', decision: bad ? 'deny' : 'allow', reason: bad ? 'Destructive command' : undefined });
  } });
```

- **Who is a guard** is decided from committed manifests and grants, never from runtime registration alone, so there is no moment when a guard is enabled but not yet protecting: a **guard extension** is an extension enabled in the workspace (active or quarantined) that holds a granted subscription to `agent.tool.call.created` **and** granted `calls` covering `agent.tool.call.review`. The agent asks the kernel with `kernel.subscribers.list {workspaceId, type: 'agent.tool.call.created'}` (`03` §3.8) when it admits each call. An extension that only subscribes (an audit log) is not a guard and never blocks anything.
- **Registering** adds the details: `agent.guards.set {guards: [{ name, title, description, tools? }]}` replaces all of the sender's guards in this workspace at once (`[]` removes them). A guard's id is `<owner namespace>.<name>`; `tools` holds type patterns (`shell.exec`, `fs.*`), absent meaning every tool. Only a guard extension may register (`agent/NOT_A_GUARD` otherwise). A guard extension registers when it receives `agent.activated` and when it is itself enabled or reloaded (`kernel.extension.enabled` / `.reloaded` with its own name), because either side may be enabled first. Registrations are stored, so restarts need nothing.
- **Covering**: when the agent admits a call, each guard extension covers it through its registered guards whose `tools` match the call's type. **A guard extension that has never registered covers every call** with the placeholder entry `'<ns>'` (fail closed). The list is fixed at admission and sent in the event's `guards`.
- **When a guard extension registers** while calls wait on it, the agent sends `agent.tool.review.release {sessionId, owner, keep}` for each such session: the `'<ns>'` placeholder and any of its guards no longer registered are replaced by the newly registered guards that cover the call (possibly none). Calls left with an empty `waitingFor` run.
- **Deciding**: each covering guard sends `agent.tool.call.review` once, with `decision: 'allow' | 'deny'`. **The guard decides how**: at once from its rules, or after asking the person with its own prompt (the prompt pattern, `08` §8.13) and then answering. The agent imposes no guard timeout and never decides on a guard's behalf. Any deny ends the call (`agent/TOOL_DENIED` with the guard's title and reason, visible to the model and the person); when all covering guards allowed it, the call runs.
- **Only real guards count**: a review is accepted only from the extension that owns a guard in the call's `waitingFor`, only while the call is `reviewing`, and only once per guard; anything else fails `agent/REVIEW_REJECTED` and changes nothing. A guard extension still at `'<ns>'` must register before its review can count.
- **A guard that asked the person** closes its prompt when it receives `agent.tool.call.completed` for that call (the turn may have been cancelled, or another guard denied it meanwhile); its late review fails `agent/REVIEW_REJECTED` harmlessly.
- **While waiting**: the session shows as "Waiting" with the guard titles, or the extension title for a guard that has not registered (`agent.reviews.list`, and the `agent.waiting` status item). The wait is bounded only by the turn deadline (§9.4) and by the person, who can cancel the turn or disable the guard extension.
- **A guard goes away**: when a guard extension is disabled in the workspace, the agent's `kernel.extension.disabled` subscription deletes its guards and sections there and sends `agent.tool.review.release {sessionId, owner}` (empty `keep`) for every session with a call waiting on it; those calls continue with the remaining guards (and run if none remain). A quarantined guard extension stays a guard: its calls keep waiting until the person re-enables it, disables it, or cancels.
- **No guard covers the call**: it runs at once, unless its command is marked `agentTool.dangerous`; then the agent asks the person in its **own** approval panel in `agent.chat.prompt` (tool, arguments summary, Allow / Deny), and the answer is `agent.approval.answer`, which has access `user`, so neither the model, nor a tool, nor a process can approve itself.
- **After the call**: `agent.tool.call.completed` is published for every call, guarded or not (outcome, who denied it and why, a short result summary), so extensions can audit, notify, or react.
- **Bash mode**: guards see the `shell.exec` call and its command line. `kv` calls made by that process run under its delegated token (`03` §3.7) and are not separate tool calls, so they are not reviewed one by one; a guard that must review every tool individually should be paired with the `direct` tool mode (a preset can set it, §9.10).
- **Subagents** use the same flow in the same workspace, so guards cover their calls too.

## 9.6 Prompt assembly and preflight

Order (cache-friendly, stable parts first):
1. Agent base instructions for the tool mode (bash policy and CLI summaries, or direct-tool guidance), plus the user's language from `ctx.locale`: "The user's language is Arabic (ar). Reply in it unless the user writes in another language." The model's replies are not translated afterwards; they are written in the right language.
2. Prompt sections (below): the workspace's sections and this session's sections, sorted by `order` (highest first), then owner name, then id; each rendered as `## <title>` followed by its content. Core defaults: persona 70 → rules 60 → skills 55 → interviewer guidance 52 → fs policy 50 → open todos 40.
3. History: latest `summary` entry (if any) + entries after its `coversThroughSeq`, preserving tool call/result pairs.


### Prompt sections

Extensions put text into the system prompt by registering **sections** with the agent. The agent reads them from its own storage while building each prompt; it never calls other extensions during a turn, so a slow or broken extension cannot stall a step.

```ts
// rules extension: one workspace section, refreshed whenever the rule files change
ctx.send('agent.prompt.section.set', { id: 'rules', title: 'Rules', order: 60, content: rulesText });
// todo extension: one section per session, refreshed whenever that session's items change
ctx.send('agent.prompt.section.set', { id: 'open-todos', title: 'Open todos', order: 40, sessionId, content: list });
ctx.send('agent.prompt.section.remove', { id: 'open-todos', sessionId });   // when nothing is open
```

- **Identity and ownership**: a section is keyed by (owner extension, `id`, `sessionId` or none); the owner is the kernel-assigned source, so an extension can only set or remove its own sections. Setting an existing key replaces it.
- **Scope**: without `sessionId` the section is in every prompt of the workspace; with it, only in that session's prompts. The session must exist in the workspace (`agent/SESSION_NOT_FOUND`). Session sections are deleted with the session and are not copied by a fork (their owner copies them on `agent.session.forked` if it wants to, as `todo` does).
- **Limits** (`agent/SECTION_LIMIT` when exceeded): `id` is lowercase kebab-case, at most 64 characters; `title` at most 100 characters; `content` at most 16 KB; `order` an integer 0–100 (default 50); at most 16 workspace sections and 16 sections per session for each extension.
- **Language**: sections are model-facing text. Owners write them in English (or build them with `ctx.i18n.t` in `ctx.locale` when the text is language-specific); the base instructions already tell the model the person's language.
- **Keeping them current is the owner's job**: an owner sends its sections when it receives `agent.activated`, when it is itself enabled or reloaded (`kernel.extension.enabled` / `.reloaded` with its own name), and whenever its data changes (a rule file edited, trust revoked, a todo completed). Sections are stored, so restarts need nothing.
- **Removal**: when an extension is disabled in the workspace, the agent deletes its sections there. A quarantined extension's sections stay (the data was valid when sent) until it is disabled.
- **Visibility**: `agent.prompt.sections.list {sessionId?}` returns every section that would go into that session's prompt, in order, with owner, title, size, and content, so the person (and the inspector) can see exactly what the model is told.
- **Budget**: sections count toward preflight like everything else; if the sections alone do not fit the model window, the turn ends with `agent/CONTEXT_TOO_LARGE` naming the largest sections.

Preflight estimates tokens (`ctx.llm.countTokens`: the provider's tokenizer when it registered one, else chars/4) for system + tool schemas + history + output reserve + margin, against the model window from `ctx.llm.models()`.
- Above `contextLimitPercent` (default 80) → compact first (§9.7), then rebuild.
- Still too large (a single irreducible input) → append a `notice` with `agent/CONTEXT_TOO_LARGE` and end the turn without calling the model.
- A model switch (`agent.session.set-model`) preflights against the new window and is rejected if the history cannot fit even after compaction.

## 9.7 Compaction (in place)

- Triggered by preflight, by `agent.compact`, or after a completed turn above the threshold. Never while a turn is mid-round: a request during a turn sets `compactRequested` and runs at turn end.
- The summary is produced by `ctx.llm.complete {purpose: 'summary'}` (the workspace's summary default model, else the session model) over the previous summary + entries not yet covered, bounded to a summary budget (newest entries win; an omitted-count marker is included). A summary call never triggers compaction (no recursion).
- Result: one `summary` entry with `coversThroughSeq`. The session ID does not change; the UI shows a "compacted here" divider. Older entries stay in the log for the user (and are removed only by retention settings).
- Failure or timeout (`compactionTimeoutMs`, default 120 s) leaves the history unchanged and appends a warning notice with code `agent/COMPACT_FAILED`.

## 9.8 Session lifecycle

- **Create**: model from the request, else the workspace default for purpose `chat` (`kernel.llm.defaults`), validated through `ctx.llm.models()`.
- **Close**: status `closed`; running turn cancelled; new `agent.send` fails `agent/SESSION_CLOSED`; history stays readable.
- **Delete**: first cancels a running turn (as §9.4, including children), then removes the session, its log, its session prompt sections, and its children; publishes `agent.session.deleted` so other extensions clean their data (e.g. `todo`). Tool results that arrive later for a deleted session are dropped.
- **Fork**: `agent.session.fork {sessionId, throughSeq?}` creates a new session with a copy of the history (and current summary) and publishes `agent.session.forked {from, to}`; `todo` copies open items on that event.
- **Retention**: `agent.retention.run` (daily schedule) keeps the newest `maxSessionsPerWorkspace` (default 50) top-level sessions; children are not counted and are deleted with their parent. It never deletes a session whose turn is not `idle` or that waits for the person; such a session is kept until the next run.

## 9.9 Subagents

`agent.child.run` (an agent tool; lane of the parent session):
```ts
{ prompt: string; mode: 'fresh' | 'fork' | 'summary'; model?; thinking?; toolMode?: 'bash' | 'direct';
  tools?: string[]; budgetTokens?: number; timeoutMs?: number }
```
- Depth ≤ 2 (`maxChildDepth`); an `agent.child.run` beyond it fails `agent/DEPTH_EXCEEDED`. The tool allowlist must be a subset of the parent's enabled tools; `interviewer.ask` and `agent.child.run` are never delegable at the last depth. `toolMode: 'direct'` with no `shell.exec` in the allowlist gives a child with no shell at all.
- Seeds: `fresh` = prompt only; `fork` = bounded recent parent history (the child's prompt gets the workspace's sections as usual; the parent's session sections are not copied); `summary` = parent's latest summary (or a new bounded one) + open todos.
- The handler creates a hidden child session (`parentId`, `depth`), sends the internal `agent.child.send` to it (`agent.send` is for people only), records a `childRuns` doc, and returns `ctx.defer()`.
- When the child's turn completes (or hits its budget, or fails), the agent calls `ctx.reply(parentCommandId, { answer, usage, stopReason: 'answered' | 'budget' | 'error' })`. A budget stop returns the child's last answer as a truthful partial result.
- The parent's cancel cancels the child (same correlation). Child usage rolls up into the parent's displayed totals.
- **What the person sees of a child.** Child sessions are hidden, so everything a child needs from the person is shown in the **root session** (the top-level session the person opened):
  - Every message a session sends carries `context.sessionId` (its own id) and `context.rootSessionId` (the top-level session; equal to `sessionId` for top-level sessions). Like every context key it is inherited.
  - The agent's approvals and guard waits of child sessions are listed by `agent.approvals.list {sessionId}` and `agent.reviews.list {sessionId}` for the root session, each marked "from a subagent" with the child's first prompt line, and are answered there (`agent.approval.answer` carries the child's `sessionId`, which the panel knows).
  - Extensions that show prompts in `agent.chat.prompt` (`interviewer`, guards that ask the person) key them by `rootSessionId ?? sessionId`, so they appear in the thread the person is looking at.
  - `agent.sessions.list` and the `agent.waiting` status item count only top-level sessions, marked "Waiting" when they or any of their children wait for the person.

## 9.10 Config

```ts
{
  toolMode: 'bash' | 'direct',                 // default per preset
  contextLimitPercent: 80, compactionTimeoutMs: 120000,          // at most 170000 (agent.compact's handler timeout is
                                                                 // 180 s); models: kernel.llm.defaults (05 §5.11)
  turnTimeoutMs: 1800000, maxToolRounds: 50, toolResultLimitBytes: 51200,
  maxSessionsPerWorkspace: 50, maxChildDepth: 2, historyWindow: 2000
}
```

## 9.11 UI contributions

- **Pages**: `agent.chat` at `/chat` (session list + an empty thread with the composer, whose submit sends `agent.chat.start` and then navigates to `/chat/{{ $reply.sessionId }}`), `agent.thread` at `/chat/:sessionId` (thread + composer + `agent.chat.prompt` slot above the composer + `agent.chat.sidebar` slot + `agent.chat.header` slot), `agent.sessions` at `/sessions` (table with filters: All / Active / Waiting / Closed, search).
- **Nav**: `agent.nav-chat` (Chat → `agent.chat`) and `agent.nav-sessions` (Sessions); a toolbar item `agent.new-chat` ("New chat") in `frame.topbar.start`; a status item `agent.waiting` in `frame.statusbar.end` showing the number of sessions waiting for the person (visible only when > 0).
- **Text**: all labels are keys in the agent's `en` and `ar` catalogs; notices are stored as code plus parameters.
- **Registered for others to fill** (`08` §8.4):

  | Slot | Accepts | Props | Layout | Filled by |
  |---|---|---|---|---|
  | `agent.chat.prompt` | `panel` | `{ sessionId }` | stack | the agent's approval panel, `interviewer`, `builder` |
  | `agent.chat.sidebar` | `panel` | `{ sessionId }` | tabs | `todo` (checklist), `shell` (Jobs) |
  | `agent.chat.header` | `toolbarItem` | `{ sessionId }` | row, max 4 | e.g. an export button from another extension |

  and the renderer target `agent.entry` (`ext.registerRendererTarget`).
- **Entity** `agent.session` with actions: rename, open beside, fork, compact, close, delete.
- **Prompt slot** `agent.chat.prompt` receives `$slot.sessionId`. The agent's approval panel lives there (bound to `agent.approvals.list`, live on `agent.approval.*`), and other extensions put their own prompts there (`interviewer`, `builder`).
- **Renderer target** `agent.entry`: the agent provides default renderers for each entry kind; other extensions register renderers for their tool results (e.g. `shell` renders `shell.exec` results as a JobCard).
- The `thread` component binds to `agent.history.get` (live on `agent.entry.appended`) with `live: { text: 'agent.tokens.generated:<id>', thinking: 'agent.thinking.generated:<id>' }`; `composer` sends `agent.send` and takes its slash menu from `agent.slash.list` with `fill: { sessionId: '$route.sessionId' }` (`08` §8.8).
- **Slash commands** are ordinary commands that declare `slash` metadata (`05` §5.5) and have access `all` or `user`; nothing registers them with the agent. `agent.slash.list {sessionId?}` reads the registry (`kernel.schema.get`) and returns `SlashCommand[] = [{ name, description: Text, command, arg?, needsForm, extension }]` for every such command whose extension is enabled in the workspace, sorted by name. `needsForm` is true when required input fields remain after `arg`, `sessionId`, and `workspaceId` are filled (`05` §5.5). When two extensions use the same `name`, both are listed as `<namespace>:<name>` and neither as the bare name. The agent's own: `/new` (`agent.session.create`), `/compact` (`agent.compact`), `/fork` (`agent.session.fork`), `/cancel` (`agent.cancel`).
- "Waiting" state: `agent.sessions.list` marks sessions with an open approval, a call waiting for guards (§9.5), or a pending tool declared `agentTool.interactive` (e.g. `interviewer.ask`). The agent knows both from its own turn state; it does not need to know how the other extension shows its prompt.

## 9.12 Failure cases

| Case | Behavior |
|---|---|
| Crash during `agent.step` before the LLM reply | redelivery re-awaits the same `kernel.llm.complete` command |
| Crash after the reply, before commit | redelivery gets the recorded reply; one assistant entry |
| LLM call fails (retryable) | the kernel LLM service retries with backoff; final failure → error notice with the `LLM_*` code, turn `failed`, idle |
| Tool handler crashes 3 times | tool command `dead` → `MESSAGE_DEAD` tool result; the model sees it and can continue |
| Tool host quarantined | tool result `HANDLER_UNAVAILABLE`; tool disappears from the next round's list |
| Kernel restart while awaiting tools | continuations still arrive after restart; the turn continues |
| User answers an interviewer question or an approval after restart | the prompt is stored data, so it is still shown; the deferred reply or `agent.approval.answer` completes and the turn continues |
| A guard's handler crashes before reviewing | `agent.tool.call.created` is durable, so the guard's subscription is redelivered and it reviews later; a duplicate review fails `agent/REVIEW_REJECTED` harmlessly |
| A guard is quarantined while a call waits for it | the call keeps waiting; the session shows "Waiting for <guard title>"; the person cancels, or disables the guard (which releases its reviews) |
| A section owner is disabled | its sections disappear from the next prompt; a turn already in its LLM call is not affected |
| The model calls a tool that is not enabled, or with invalid arguments | an immediate tool error (`agent/UNKNOWN_TOOL` or `VALIDATION_FAILED` with issues) that the model sees; no guard review, no kernel send |
| A subagent needs an approval or asks a question | shown in the root session's thread, marked "from a subagent" (§9.9) |
| An async job finishes while the session is idle | `agent.inject` starts a new turn with the job result |
| The agent is enabled after a section owner or guard | the agent publishes `agent.activated`, and every owner and guard registers again |
| A guard extension is enabled but has not registered yet (or its registration handler fails) | it covers every call with its `'<ns>'` placeholder, so calls wait instead of running unguarded; they continue once it registers, or the person disables it or cancels |
