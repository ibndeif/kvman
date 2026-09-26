# 02 — Messaging

## 2.1 Addresses

```ts
type Address =
  | `kernel`
  | `ext:${string}`                       // ext:@kvman/agent
  | `user:${string}`                      // user:local
  | `user:${string}/client:${string}`     // one browser tab
  | `proc:${string}`;                     // a supervised process acting through a job token
```

Senders address **message types**, not actors (`ctx.send('pdf.translate', …)`). The router resolves the handling extension from the registry and the workspace's enabled extensions. Addresses appear as `source` (always kernel-assigned) and as `target` for `ui.*` commands.

## 2.2 Envelope

```ts
type Message = {
  v: 1;
  id: string;                    // ULID, kernel-assigned
  kind: 'command' | 'query' | 'event';
  type: string;                  // 'pdf.translate'
  source: Address;               // kernel-assigned from the authenticated caller
  target?: Address;              // ui.* commands only
  workspaceId?: string;          // absent = global scope
  lane?: string;                 // rendered lane template; the scheduler's lane is (handling extension, lane)
  payload: Json;                 // ≤256 KB inline; larger spills to a blob (payloadRef)
  payloadRef?: string;
  correlationId: string;         // root of the trace tree; inherited
  causationId?: string;          // id of the message whose handler produced this one
  context: Record<string,string>;// inherited baggage, ≤2 KB (e.g. { sessionId })
  onReply?: { type: string; context?: Json }; // continuation: deliver the reply as this command
  idempotencyKey?: string;
  priority: 'interactive' | 'normal' | 'background';
  delivery?: 'durable' | 'transient' | 'live';  // events only, from the event's registration (§2.5)
  deadlineAt?: number;           // epoch ms, absolute
  notBefore?: number;            // timers and delayed sends
  createdAt: number;
};

type ReplyPayload = { ok: true; value: Json } | { ok: false; problem: Problem };   // a command's result (§2.3)
```

Callers supply `type`, `payload`, and optionally `lane` (only when the handler does not declare one), `idempotencyKey`, `priority`, `deadlineAt`, `delayMs` or `at` (not both), `context` additions, and `onReply`. Everything else is set by the kernel. `context` is inherited from the causing message; a handler may add keys but cannot remove kernel-set keys. A caller lane for a handler with a lane template, a change to a kernel-set key, and both `delayMs` and `at` fail `VALIDATION_FAILED` (ADRs 0054, 0058).

## 2.3 The three kinds

| Kind | Meaning | Handlers | Persisted | Returns | May write state | Who may send |
|---|---|---|---|---|---|---|
| **command** | "do X" | exactly 1 | durable | its result (the **reply**, below) | yes | as its `access` allows (§2.4): users, extensions, processes (token), kernel |
| **query** | "tell me X" | exactly 1 | never | data | no (read-only store) | as its `access` allows |
| **event** | "X happened" | 0..n subscribers | per its delivery class (§2.5) | nothing | subscribers may | extensions (their own registered events), kernel. **Never users or processes.** |

Everything the kernel pushes to a person travels over the browser's one SSE stream (`12` §12.3): durable and transient events, live events (token and progress chunks), late command results, and the one-way `ui.*` messages. None of these needs a kind of its own.

**One dispatch path.** Every kind is delivered the same way. The kernel looks up the handlers registered for the type in its registry (`registerCommand`, `registerQuery`, `subscribe`), hands the message to the host of each handler's extension, and the host calls the function it bound at load (`05` §5.1). There are no in-memory listeners. The kinds differ only in what the sender gets back:

| Kind | Handlers called | The sender gets |
|---|---|---|
| command | the one registered handler | the handler's result, in the same response: the HTTP response body, or the value of `ctx.command` |
| query | the one registered handler | the handler's result, in the same response |
| event | every subscriber (none for live events, which go only to SSE clients) | nothing; the publisher does not wait |

A command is persisted before its handler runs, so a crash does not lose it: the kernel redelivers it, and a caller that lost its connection retries with the same idempotency key and receives the stored result. Two tools exist for results that should not be waited for in the same request: `ctx.send` (fire and forget, optionally with a continuation) and `ctx.defer` (the handler returns now and the reply is completed later) — §2.8.

**Replies.** A reply is not a message kind: it is the second half of a command. The handler's return value (or thrown problem) becomes a `ReplyPayload`, stored with the command (`messages.result`, `04` §4.1) in the handler's unit of work, and delivered to whoever waits for it: the HTTP response, a pending `ctx.command`, a continuation (`onReply`), or, for a caller whose request already ended, the SSE `reply` frame and `GET /api/v1/messages/:id` (`12`). A deferred command's reply is written later by `ctx.reply` (§2.8). A result over 256 KB is stored like a large payload: it spills to a blob (`messages.result_ref`), and one over 16 MB fails `PAYLOAD_TOO_LARGE`. Nothing registers a handler for replies and nothing sends one by type.

Rules:
- A **command** type has exactly one handler in a workspace. The owner declares its input and output schemas and its `access` (§2.4).
- A **query** runs on a priority path: it never waits behind commands in a lane. It receives a read-only store and cannot send commands or publish events. It has `access` like a command.
- An **event** type is declared by its publisher with a schema and a delivery class (§2.5). Subscribers are registered with `ext.subscribe` in `setup` and recorded in the manifest; subscribing to another extension's events needs a grant (`05` §5.7). Durable events are delivered to each subscriber as its own inbox row and also appended to the published-events log for client resume.
- **Live events** (delivery `live`) carry a `key` (for example the session or job id) and are addressed as `<type>:<key>`, e.g. `agent.tokens.generated:abc`. They are published at once with `ctx.live` (not at commit), are never stored, go only to SSE clients (extension handlers cannot subscribe to them), and the kernel keeps the last 1,000 per `<type>:<key>` in memory for late joiners. Queries cannot publish them (queries are read-only).
- **Runs.** Every live event carries `run`: the id of the message whose handler published it (for LLM deltas relayed by the kernel, the calling handler's message, e.g. the `agent.step`). Several runs may use the same `<type>:<key>` one after another (each agent step of a session) or overlap briefly (a retry and a new step). Consumers keep text per run and show the **newest run** (the one whose first chunk arrived last). Only the publishing extension's own registered live events can be published, and only by it (and by the kernel on its behalf when relaying LLM deltas, `03` §3.12).
- **Live payloads** have one of four shapes (`LiveChunk` in `@kvman/protocol`); an event registered with delivery `live` declares which of the first three it sends:

  | Chunk | Sent by | Consumers do |
  |---|---|---|
  | `{ text: string }` | extensions | `liveText` and `thread` append it |
  | `{ value: number, label?: Text }` (0–1) | extensions | `progress` shows the latest one |
  | `{ data: Json }` | extensions | passed to widgets as is (`08` §8.10) |
  | `{ reset: true }` | kernel only | discard what was received **for that `run`**; if it was the run on screen, show the previous run's text, or the initial state |

- **Live events are a preview; committed data is the truth.** Because live events are sent before commit, an attempt that publishes them and then does not commit (crash, `HANDLER_TIMEOUT`, retry, failure, cancel) would leave text on screen that the retry sends again. So when such an invocation ends, the kernel publishes `{ reset: true }` with that invocation's `run` on every `<type>:<key>` it published to; the retry is a new attempt of the same message, so it publishes under the same `run` again from the beginning. When the handler commits, its durable result replaces the preview **by run**: a record that replaces a preview stores the run id (the agent's assistant entry has `runId`, `09` §9.1), and a component that shows both drops the run's preview as soon as its data contains a record with that `runId` (`thread`, `08` §8.8). A component that shows only the preview (`liveText`, `progress`) keeps the newest run's last state until it unmounts. A gap in chunk numbers (`12` §12.3) is handled like a reset of every run on that address, followed by a refetch. A kernel crash needs no reset message: live state is memory only, so after the restart no chunk of the dead attempt remains, and a live subscription the shell re-creates (`hello` no longer lists it) discards what it had for that address, like a gap (ADR 0101).

## 2.4 Type names, namespaces, contracts

- Type format: `<namespace>.<segment>[.<segment>…]`, lowercase, multi-word segments in kebab-case (`agent.session.set-model`). The namespace is declared in `defineExtension`'s `meta.namespace` and is the first segment.
- Reserved: `kernel.*` (kernel API), `ui.*` (commands handled by the kernel that deliver one-way messages to the user actor: `ui.toast`, `ui.notify`, `ui.dismiss`, `ui.navigate`, `08` §8.11), `frame.*` (the shell's frame slots, `08` §8.3), `sys.*` (reserved, unused in v2). An extension whose `meta.namespace` is one of these fails validation.
- `ui.*` commands may be sent only by extensions holding the `ui` capability and by the kernel (a user sending one gets `CALLER_NOT_ALLOWED`). The kernel handles them at commit and replies `{ ok: true }` at once; senders never wait for a person.

### Access

Every command and query declares who may call it with `access` (default `'all'`). The router checks it against the kernel-assigned source (`03` §3.3 step 4), so it cannot be forged; a violation fails `CALLER_NOT_ALLOWED`.

| `access` | Who may call | Typical use |
|---|---|---|
| `all` (default) | people (web UI, CLI, slash commands) and extensions (their handlers, views' extension-side calls, widgets, and processes with job tokens) | ordinary commands and queries: `pdf.translate`, `pdf.files.list` |
| `user` | only people: a `user:*` source, i.e. a click, form, or slash command in the shell, or the CLI | answering a prompt, approving, confirming a grant: `agent.approval.answer`, `interviewer.question.answer` |
| `extensions` | only extensions (their handlers, widgets, and processes acting with their job tokens), never a person directly | APIs one extension offers others: `agent.prompt.section.set`, `agent.tool.call.review` |
| `internal` | only the owning extension and the kernel (continuations, timers, schedules, `onAbort`, `onExit`) | `agent.tool.record`, `agent.turn.expire` |

- The kernel may always call any command or query.
- Access says *who* may call; the `calls` and `tools` capabilities still decide *which extensions* may call foreign types (`05` §5.7). An `extensions` or `all` command of another extension needs a grant; an `internal` or `user` command of another extension is never reachable from extension code.
- `internal` types are hidden from `/schema` (for every caller, their owner included, ADR 0111), the UI, `kv help`, and the agent's tool list. `extensions` types cannot be the target of a view's action, form, or button (a person would be the sender) and never appear in the slash menu; view validation reports this (`06` §6.3).
- A command with access `all` or `user` MAY declare `slash` metadata (`05` §5.5) to appear in the agent composer's slash menu (`09` §9.11).
- An `agentTool` (a command or a query) must have access `all` or `extensions` (the agent, an extension, calls it).
- One extension per namespace **per workspace**. Several installed extensions may declare the same namespace (alternatives); a workspace's preset enables at most one of them.
- `implements: 'agent@1'` declares that an extension provides the `agent@1` contract: a published set of type names and schemas. Pages and callers written against the contract work with any implementation. Contracts are versioned by major; breaking changes need a new major.
- Error codes from extensions are namespaced: `pdf/NOT_A_PDF`.

### Naming grammar

A name does not encode its kind (the kind is declared and shown in the registry), but each kind has its own shape, so a person or an LLM can tell from `pdf.file.translated` versus `pdf.file.translate` whether to subscribe or to call.

| Kind | Shape | Last segment | Examples |
|---|---|---|---|
| command | `<ns>[.<entity>].<verb>` | an imperative verb, never a read verb | `pdf.translate`, `agent.session.fork`, `kernel.extension.install` |
| internal command | same as command, declared `access: 'internal'` | imperative verb | `agent.tool.record`, `agent.turn.expire` |
| query | `<ns>[.<entity>].<read-verb>` | `get`, `list`, `search`, `count`, `preview`, `validate` | `agent.sessions.list`, `pdf.files.list`, `kernel.trust.preview` |
| event (any delivery class) | `<ns>[.<entity>].<past-participle>` | past tense | `pdf.translated`, `agent.entry.appended`, `kernel.message.dead-lettered` |
| live event address | `<event type>:<key>` | the key (an id) | `agent.tokens.generated:<sessionId>`, `shell.output.written:<jobId>`, `pdf.progress.updated:<fileId>` |
| error code | `<ns>/UPPER_SNAKE` | — | `pdf/NOT_FOUND` |
| entity, contribution id | `<ns>.<noun>` | a noun | `agent.session`, `agent.chat.sidebar` |

Rules:
- Collections use the plural for listing (`agent.sessions.list`) and the singular for one item (`agent.session.get`).
- One name is never used for two kinds (e.g. a command and a query).
- Component names (built-in and extension) follow the UI-kit camelCase convention of the component library (`liveText`, `pdf.fileCard`); kebab-case applies to message types.
- Agent tools follow the same grammar as everything else: a read-only tool is a query and ends in a read verb (`fs.file.get`, `fs.dir.list`, `fs.files.search`); a tool that changes something is a command (`fs.write`, `fs.edit`).
- `kernel.validate` checks the grammar. Violations are warnings for installed extensions and errors for builder-generated ones (from M6, ADR 0108); each issue carries a hint (`event names end in a past participle: did you mean "pdf.file.translated"?`). Past participles are checked with a small built-in word list plus the `-ed` rule; an extension can declare exceptions with a reason (`namingException: '<reason>'` on the type's definition, reported as a warning that never becomes an error, ADR 0016).
- **Exact checks** (ADR 0010):
  - *Format* (always an error): at least two segments; every segment lowercase kebab-case (`[a-z][a-z0-9]*` words joined by `-`); the namespace is 2–32 characters.
  - *Query*: the last segment is exactly a read verb (`get`, `list`, `search`, `count`, `preview`, `validate`). Hint: `query names end in a read verb (get, list, search, count, preview, validate)`.
  - *Event* (every delivery class): the **last** word of the last segment is a past participle: it ends in `-ed` or is in the built-in list of irregular participles (`written`, `sent`, `forgotten`, `done`, …). Hint: `event names end in a past participle: did you mean "<suggestion>"?`.
  - *Command*: the **first** word of the last segment (`set-model` → `set`) is neither a read verb nor a past participle. Words whose participle equals their base form (`set`, `read`, `run`, `put`, `cut`, `reset`, …) count as verbs, and words ending in `-eed` (`seed`, `feed`) and `embed`, `shred` do not count as `-ed` forms. Hint: `command names end in an imperative verb: did you mean "<suggestion>"?` (`pdf.translated` → `"pdf.translate"`).
  - Suggestions use simple English inflection (`+d`, `+ed`, `-y` → `-ied`, and the reverse); they are exact for the plan's examples and best effort otherwise.

## 2.5 Durability and event delivery classes

Commands are always durable; queries are never stored. An event's delivery class is fixed when its type is registered (`ext.registerEvent(name, { delivery })`, default `durable`):

| Class | Applies to | When it is sent | Storage | Guarantee | Receivers | Examples |
|---|---|---|---|---|---|---|
| `durable` | commands (always), their replies, events | at commit | inbox row per receiver, in the same transaction as the sender's unit of work; events also in the published-events log | at-least-once delivery, effectively-once storage effects | subscribers (handlers) and SSE clients (resumable with `Last-Event-ID`) | `pdf.translated`, `agent.turn.completed` |
| `transient` | events | at commit | memory only | at-most-once; may drop under backpressure; a subscriber's delivery runs like a durable one (lane, limits) but is never retried and is lost on restart (ADR 0069) | subscribers and SSE clients | `agent.entry.appended` (UI refresh) |
| `live` | events | **immediately**, not at commit | memory ring of 1,000 per `<type>:<key>` | best effort; in order per `<type>:<key>`; may drop; reset by the kernel if the sender does not commit (§2.3) | SSE clients only | `agent.tokens.generated`, `shell.output.written` |

Messages sent by a handler are part of its unit of work: they become visible only when the handler commits. This prevents "phantom" messages from handlers that later fail. Live events are the only exception: they are published immediately (a token stream must not wait for commit), which is why the kernel resets them when the attempt does not commit.

## 2.6 Lanes and ordering

- A handler definition MAY declare a **lane template** with `lane`; the lane is `(handling extension, rendered template)`. The kernel renders the template at admission, without running extension code:
  ```ts
  lane: 'file:{{ $payload.fileId }}'        // a payload field
  lane: 'session:{{ $context.sessionId }}'  // a context value
  lane: 'job:{{ $message.id }}'             // the message's own id (one lane per message)
  lane: 'section:{{ $message.source }}.{{ $payload.id }}:{{ $payload.sessionId }}'
  ```
  A template is text with `{{ <path> }}` placeholders (spaces allowed inside the braces) and has at least one placeholder (ADR 0016). Allowed paths: `$payload.<field>[.<field>…]`, `$context.<key>`, `$message.id`, `$message.source`, `$message.workspaceId`. Values must be strings or numbers (`null`, booleans, objects, and arrays fail `VALIDATION_FAILED`, ADR 0058); an absent path renders as `-`, except when every path is absent, which fails admission with `VALIDATION_FAILED` (for a subscription's lane only that delivery is stored `failed`, ADR 0053) (the handler would otherwise share one lane for everything by accident). `$payload` paths are checked against the input schema at install (`06` §6.3, ADR 0109).
- The scheduler runs at most one message per lane at a time, in `seq` order. Only a `running` message holds its lane; a deferred command in `awaiting` releases it (ADR 0063). Messages without a lane have no ordering and run as capacity allows.
- There is **no global order**. Ordering across lanes or extensions is only by causation (a message is always created after its cause commits).
- **Reentrancy:** if a handler holding lane L calls (`ctx.command`) a command whose lane is L, or whose lane is held by any running ancestor in the current causation chain, the kernel fails the call immediately with `LANE_REENTRANT`. This prevents deadlocks. Use a continuation instead.
- **Control messages** (e.g. `agent.cancel`) declare no lane so they are not queued behind the work they control.

### Priority

- Three classes, highest first: `interactive`, `normal`, `background`. The scheduler picks by class first (`03` §3.4); `background` messages waiting more than 30 s are treated as `normal`. The wait starts when the message becomes runnable: at admission, when its timer comes due, or when its retry backoff ends (ADR 0064).
- **Defaults at admission**: a message from a user (shell or CLI) is `interactive`; from a process token, `normal`; kernel housekeeping (retention, refresh jobs) is `background`; schedules and timers are `normal`.
- **Inheritance**: a message created inside a handler inherits its parent's priority, so every step of a person's action (for example each `agent.step` of a chat turn) stays `interactive`.
- **Handler default**: a command definition's `priority` is used as the request when the sender requests none, and is capped like any request (ADR 0065).
- **Lowering only**: a sender may request a lower class than the inherited one (`priority: 'background'` for bulk work) but never a higher one. A request for a higher class is silently lowered to the inherited class. Only users can start an `interactive` chain.

## 2.7 Idempotency

- `idempotencyKey` is required for commands sent by users, processes, and HTTP callers. Extensions MAY set one with `ctx.send(…, { idempotencyKey })` to deduplicate a command across invocations (e.g. one job result injected once); otherwise the kernel derives one.
- Uniqueness: `(source, idempotencyKey)` within the message retention window (default 7 days).
- Digest: SHA-256 of canonical JSON of `{type, workspaceId, lane, payload}`. Same key + same digest → returns the original message ID and, when available, its reply. Same key + different digest → `IDEMPOTENCY_MISMATCH` (a send with `onReply` that fails this way is stored as a failed command without the key, ADR 0057).
- Kernel-derived keys:
  - `ctx.command` inside a handler: `<invocationMessageId>:command:<stepName>`
  - send inside a unit of work: `<invocationMessageId>:send:<index>`
  - continuation delivery: `<commandId>:reply`

  Because of these keys, redelivering a handler never sends a second copy of any message it already committed or called.

## 2.8 Request/reply patterns

**1. `ctx.command` — wait for the result inside the handler (short waits)**
```ts
const r = await ctx.command('ocr.extract', { blobId });
```
- Sent immediately (durable), journaled as a step. On redelivery the kernel re-awaits the same command (same derived key); if it has already completed, its stored reply is returned. Nothing is sent twice.
- Bounded by the caller's deadline. Subject to `LANE_REENTRANT`.
- `ctx.llm.complete` is built on `ctx.command` (it calls `kernel.llm.complete`, `05` §5.11).

**2. Continuation — long waits without holding a lane**
```ts
ctx.send('shell.exec', args, { onReply: { type: 'agent.tool.record', context: { sessionId, turnId, toolCallId } } });
```
- The reply is delivered later as a new command of type `onReply.type` to the sender's extension, with payload `{ reply: ReplyPayload, context }`. It is durable and runs in whatever lane that handler declares. Continuation handlers are declared `access: 'internal'`.

**3. Deferred reply — reply from a later handler**
```ts
// in interviewer.ask (an agent tool): store the pending question, show it in our own UI
ctx.store.collection('questions').put({ id: ctx.message.id, sessionId, question, status: 'open' });
ctx.publish('interviewer.question.asked', { questionId: ctx.message.id, sessionId });
return ctx.defer({ onAbort: 'interviewer.question.expire' });   // command stays "awaiting"

// later, in interviewer.question.answer (access: 'user'), sent by the person from our panel
ctx.reply(questionId, { answer });                               // completes interviewer.ask
await ctx.store.collection('questions').patch(questionId, { status: 'answered' });
```
- A deferred command stays in state `awaiting`, without holding its lane (ADR 0063), until any handler of the same extension calls `ctx.reply(commandId, value | problem)` in a committed unit of work, or its deadline passes (`DEADLINE_EXCEEDED`), or it is cancelled (`CANCELLED`).
- `ctx.reply` on a command that is no longer awaiting fails `REPLY_NOT_AWAITING` and the unit of work rolls back. This is how "first answer wins" works when two tabs answer the same prompt.
- `defer({ onAbort })` names an internal command the kernel sends to the owner when the deferred command ends **without** its reply (cancel or deadline), with payload `{ commandId, reason: 'cancelled' | 'deadline' }`, so the owner can close its pending UI. This is the standard **prompt pattern** (`08` §8.13).

**HTTP callers** receive the result in the response of the same request, as soon as the handler's unit of work commits (`12` §12.2). Only a command whose handler defers its reply, or that is still running at the request cap, answers `202 { id, state }` instead; its reply then reaches the shell on its event stream (`12` §12.3), and any caller can read it with `GET /api/v1/messages/:id`.

## 2.9 Deadlines and cancellation

Two limits exist, and they are different things:

| | Message deadline (`deadlineAt` on the envelope) | Handler timeout (`timeoutMs` on the handler definition) |
|---|---|---|
| Meaning | "the sender no longer wants a result after this moment" | "one run of this handler may take at most this long" |
| Set by | the sender (optional), or inherited (below) | the handler's owner; defaults: command 60 s, query 5 s, event handler 30 s; max 24 h |
| Clock starts | absolute time, fixed at admission; includes time spent waiting in a lane | when the invocation is claimed (each attempt gets a fresh timeout) |
| When reached | the message ends with `DEADLINE_EXCEEDED`: final, never retried | the attempt ends with `HANDLER_TIMEOUT`: retryable, counts as an attempt (§2.13) |

- **Invocation deadline**: each invocation receives `ctx.deadlineAt = min(message deadlineAt, claim time + timeoutMs)` and `ctx.signal`, which fires at that moment. The kernel reports whichever of the two limits was reached.
- **Waiting too long**: a pending message whose `deadlineAt` passes before it is claimed is not run; it ends `DEADLINE_EXCEEDED` and its waiters get that reply.
- **Inheritance**: a message created inside a handler gets a `deadlineAt` as follows:
  - `ctx.command` (and `ctx.llm.complete`, which is one): `min(requested ?? none, parent invocation deadline)`, because the parent is waiting for it.
  - `send` (with or without `onReply`), published events, and timers: only the `deadlineAt` the sender passes explicitly; none by default. These run after the parent has finished, so the parent's deadline does not apply.
  - A continuation (`onReply`) delivery: none; its handler timeout still applies.
  - A deferred command keeps its own `deadlineAt`; `ctx.defer()` does not change it. While `awaiting` no handler runs, so only the message deadline can end it.
- **Queries** have no retry: reaching the handler timeout ends them with `QUERY_TIMEOUT`.
- `kernel.cancel { messageId } | { correlationId }` selects a scope:
  - `{ messageId }`: that message and every unfinished message it caused, directly or indirectly (its causation descendants: called and sent commands, continuations, deferred commands); the walk passes through finished messages, so a finished message's unfinished descendants are cancelled too (ADR 0083);
  - `{ correlationId }`: every unfinished message of that correlation.

  For each message in scope the kernel aborts the running invocation (its signal fires), kills processes it started, replies `CANCELLED` to its waiters (a deferred command also triggers its `onAbort`), and marks it `cancelled` if it was still `pending` or `awaiting`. Finished messages are untouched, so cancelling something that already completed is a no-op that returns `{ cancelled: 0 }`.
- Who may cancel: the user, `kernel.admin`, and any actor for messages it sent itself or whose correlation it started; anyone else fails `CAPABILITY_DENIED` and cancels nothing (ADR 0079). A running message is marked `cancelled` in the cancel's unit, and its later result is discarded (ADR 0083).
- After cancellation or deadline, any further RPC from that invocation is rejected and any unit of work it returns is discarded.

## 2.10 Correlation, causation, context

- The first message from a user action gets a new `correlationId`: its own `id` (ADR 0058). Every message produced while handling it inherits it; `causationId` points to the direct parent.
- The inspector reconstructs the full tree (who caused what) from these two fields.
- `context` is small inherited baggage for cross-cutting identifiers. Example: the agent sets `sessionId` when it sends a tool command, so the `shell` extension knows which session an async job belongs to without a special API.
- The kernel sets `locale` in the context of every message that does not inherit one (user actions, schedules, timers, kernel-originated messages) from the user's language preference at admission (`08` §8.16). Like every kernel-set key it is inherited and cannot be removed or changed, so a handler several steps down the chain still knows the language of the person who started it (`ctx.locale`). A language change affects new correlations only.

## 2.11 Guarantees summary

| Property | Guarantee |
|---|---|
| Durable delivery | at least once |
| Storage effects of a handler | exactly once (atomic unit of work) |
| Messages emitted by a handler | exactly once (derived idempotency keys) |
| External effects | at most once per recorded step, or `EFFECT_INDETERMINATE` if a step started but did not record |
| Ordering | FIFO per lane; causal across a chain; nothing else |
| Queries | read committed data; never block on lanes |
| Live events | best effort, in order per `<type>:<key>`, may drop under backpressure; reset when the sender does not commit |

## 2.12 Message lifecycle (durable deliveries)

```
          admit                claim               commit ok
pending ─────────▶ (index) ───────▶ running ─────────────▶ done
   ▲                                  │ │  └─ ctx.defer() ──▶ awaiting ──ctx.reply──▶ done
   │                                   │ │                        └─deadlineAt──▶ failed (DEADLINE_EXCEEDED)
   │   retryable failure / crash /     │ └─ non-retryable problem or deadlineAt ──▶ failed (problem replied)
   │   HANDLER_TIMEOUT                 │
   └──────── attempts < max ◀──────────┘
                                   attempts == max ──▶ dead (MESSAGE_DEAD replied; inspector can retry)
                    kernel.cancel ──▶ cancelled (CANCELLED replied)
```

## 2.13 Limits and defaults

| Item | Default |
|---|---|
| Inline payload and command result | 256 KB (spill to blob up to 16 MB, else `PAYLOAD_TOO_LARGE` with `{ limit: 'payload', max: 16777216 }`; inline up to 16 MB until the blob store, ADR 0055) |
| `context` map | 2 KB |
| Live event payload | 16 KB; ring 1,000 per `<type>:<key>` |
| Max attempts (crash, host loss, `HANDLER_TIMEOUT`, retryable problem) | 3 runs (`attempts == maxAttempts` → `dead`); retry *n* waits 1 s, 5 s, 30 s, then 30 s for every later retry; per-handler `maxAttempts` override (ADR 0059) |
| Storage conflict retries | 5 immediate reruns per attempt, not counted; the sixth conflict is a counted, retryable failure (ADR 0059) |
| Handler timeouts | command 60 s · query 5 s · event handler 30 s · max 24 h |
| Message deadline | none unless set or inherited (§2.9) |
| Retention of finished messages | 7 days (per-type override, e.g. `kernel.llm.complete` 1 h) |
| Nested `ctx.command` depth | 8 (a deeper call fails `VALIDATION_FAILED`, `params { limit: 'depth', max: 8 }`, ADR 0085) |
