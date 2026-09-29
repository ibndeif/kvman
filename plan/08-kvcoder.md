# 08 — kvcoder (namespace `kvcoder`)

kvcoder is the app-building harness, built on kvai and kvwebui. Its agent has one tool, `bash`, and reaches everything through it. Other extensions extend kvcoder with **connectors** and **sections**.

## 8.1 Sessions and turns

- **Storage.** Sessions and their messages are stored per workspace. Messages are pi-ai messages plus notices and summaries.
- **Sending.**
  - `kvcoder.message.send` is for the person only. When the session is idle, it starts a turn. When a turn is running, the message steers it: the next step sees it.
  - `kvcoder.message.inject` does the same for extensions, and marks the message as coming from that extension.
- **Steps.** A turn is a chain of async jobs, one per step (§8.2). A step that continues the turn queues the next one and sends the progress chunk `{ type: 'follow', jobId }`, so the chat keeps streaming in one bubble.
- **Statuses.** A session is `idle`, `running`, or `waiting`: suspended on a question or on subagents, with no job running.
- **Cancel.** `kvcoder.turn.cancel` cancels:
  - the running step;
  - its subagents' turns;
  - its pending questions (a later answer fails `kvcoder/QUESTION_NOT_FOUND`).

  It then adds a notice and sets the session idle. `--async` connector jobs keep running and still report back.
- **Restart.** Step jobs register `retries: 0`. A step interrupted by a stop ends `failed`, and the turn is marked interrupted with a notice; the person sends a message to go on. Suspended turns survive restarts.
- **Compaction.** Before each step, tokens are estimated (characters / 4) against the model's window.
  - Above `kvcoder.compactAt`, kvai summarizes the older messages, the last 10 are kept whole, and a summary message is stored. Older messages stay visible but aren't sent.
  - `kvcoder.session.compact` compacts by hand.
  - A failed summary adds a notice and the step goes on; `kvai/CONTEXT_TOO_LONG` then ends the turn.
- **Limits.** A turn ends with a notice after `kvcoder.maxSteps` steps. The oldest idle top-level sessions beyond `kvcoder.sessions.keep` are deleted daily.

## 8.2 A step

1. **Build the prompt**, in this order:
   - the base prompt: English, telling the model to reply in `kernel.language` unless the person writes in another language;
   - the sections, by `order` (§8.4);
   - the connector index: each connector's name and description, plus the binary connectors whose checks passed.
2. **Call the model.** `kvai.complete` with the session's messages (after the summary) and the one tool `bash { command, description, timeoutMs? }`. Deltas stream to the chat.
3. **Handle the answer.**
   - **Bash calls.** For each call in the assistant message, kvcoder decides how it runs (§8.3). Then it queues the next step, or suspends the turn.
   - **No calls.** The session goes idle, unless messages arrived while the step ran, in which case another step runs.

## 8.3 How a bash call runs

| The command is | It runs as |
|---|---|
| `<connector> <command> '<json>'` (or JSON as a heredoc on stdin), standing alone | the connector's kernel command, through `ctx.exec`; the result is the output as JSON text, or `error <code>: <message>` with exit code 1 |
| the same with `--async` | kvcoder's own job `kvcoder.connector.run` (which runs the command); prints `started <jobId>`. When it ends, the result is appended as a message, and starts a turn if the session is idle. |
| `<connector> -h` / `<connector> <command> -h` | the connector's command list / that command's input and output JSON Schemas |
| `ask …`, `subagent run …` | built-in connectors that suspend the turn (§8.5) |
| `jobs list`, `jobs cancel <id>` | built-in connector commands for `--async` jobs |
| anything else | real bash (below) |

**Real bash.**
- It runs `bash -lc <command>` in the workspace folder.
- **Approval.** With `kvcoder.bash.approval: 'ask'` (the default), the call first becomes an `ask confirm` question, and the turn suspends. A denied call returns "denied by the user".
- **Timeout.** The default is 120 s; the model may ask for up to 600 s. The process group is killed on timeout or cancel.
- **Output.** stdout and stderr are combined. Output over 30 KB keeps its first and last 15 KB around a `[… N bytes omitted …]` marker. The result includes the exit code.

## 8.4 Extending kvcoder

An extension that depends on kvcoder imports the helper `@kvman/kvcoder/connector`. It is the one runtime import of another extension that the walls allow.

```ts
import { registerConnector, registerSection, registerBinary } from '@kvman/kvcoder/connector';

export default (ctx: Ctx) => {
  const fs = registerConnector(ctx, 'fs', 'Read and edit workspace files.');
  fs.registerCommand({ name: 'read', description: 'Reads a file.', input, output, handle });  // → <ns>.fs.read
  registerSection(ctx, { id: 'rules', title: 'Rules', order: 60, content: async ({ sessionId }) => rulesText });
  registerBinary(ctx, { name: 'gh', description: 'GitHub CLI.', check: 'gh --version', install: 'https://cli.github.com' });
};
```

- `registerCommand` registers an ordinary public kernel command, `<namespace>.<connector>.<name>`. Sync and async behavior are the kernel's.
- The helper registers one query, `<namespace>.kvcoder.get { sessionId }`, which returns the extension's connectors, sections, and binaries.
- **At each step**, kvcoder calls every such query (found through `kernel.extensions.list`) in parallel, with a 2 s timeout. One that fails or times out contributes nothing to that step and adds a notice.
- **Section caps.** 16 KB per section and 64 KB in total.
- **Binary checks.** A binary's `check` runs once per session (5 s timeout), and only the binaries that pass are listed. The setting `kvcoder.binaries` adds more binaries.

## 8.5 Built-in connectors

**ask** suspends the turn until the person answers. The answer becomes the bash result, and a dismissal gives `{ "dismissed": true }`.

| Call | Result |
|---|---|
| `ask text '{ "prompt", "placeholder"? }'` | `{ "text" }` |
| `ask choice '{ "prompt", "multiple", "options": [{ "id", "label", "description"? }] (2–10), "other"? }'` | `{ "selected": [ids], "other"? }` |
| `ask confirm '{ "prompt", "danger"? }'` | `{ "confirmed" }` |

- The step sends a component chunk, so the chat shows the question card inline.
- The person answers with `kvcoder.question.answer` (user only). That appends the result and queues the next step, and the card follows that step.

**subagent** runs a hidden child session:

```
subagent run '{ "task", "mode": "fresh" | "fork", "connectors"?: [names], "bash"?: true }'
```

- **Modes.** `fresh` gives the child the base prompt, the sections, and the task. `fork` gives it a copy of the parent's messages so far (plus its summary), then the task.
- **Connectors.** `connectors` is a subset of the parent's (default: all). `subagent` is never included, so depth is 1, and `ask` always is. `bash: false` allows connector calls only.
- **Waiting.** The parent's turn suspends until the child ends, and the child's final answer becomes the bash result.
  - Several runs in one message run in parallel.
  - `--async` lets the parent continue; the answer arrives later as a message.
- **Questions.** A child's approvals and questions show in the root chat.

## 8.6 API

| Name | Kind | Input → output |
|---|---|---|
| `kvcoder.session.create` | command | `{ title? }` → `Session` |
| `kvcoder.session.list` | query | `{ limit }` → top-level `Session[]`, newest first |
| `kvcoder.session.get` / `.rename` / `.delete` / `.compact` | query / commands | `{ sessionId, … }` |
| `kvcoder.message.send` | command, user only | `{ sessionId, text }` → `{}` |
| `kvcoder.message.inject` | command | `{ sessionId, text }` → `{}` |
| `kvcoder.message.list` | query | `{ sessionId, limit }` → `Message[]` |
| `kvcoder.turn.cancel` | command | `{ sessionId }` → `{}` |
| `kvcoder.question.answer` | command, user only | `{ questionId, answer }` → `{ jobId }` |
| `kvcoder.prompt.get` | query | `{ sessionId }` → the exact system prompt |

All are public. `Session` is `{ id, title, status, parentId?, model, usage, createdAt, updatedAt }`.

## 8.7 UI and settings

**UI.**
- The **Chat** page `kvcoder.chat`, the coder preset's home. It has a session list with new-chat, and the `chat` component bound to `kvcoder.message.list` and `kvcoder.message.send`.
- A `kvcoder.session` page with a `sessionId` param.
- A **status item** with the count of waiting sessions.
- **Custom components:** the question card and a bash-result card (the command, exit code, and collapsible output).
- A **Prompt** tab showing `kvcoder.prompt.get`.

**Settings.**

| Setting | Default |
|---|---|
| `kvcoder.model` | `kvai.defaultModel` |
| `kvcoder.thinking` | `medium` (`off`, `low`, `medium`, `high`) |
| `kvcoder.maxSteps` | 50 |
| `kvcoder.bash.approval` | `ask` (`auto`) |
| `kvcoder.compactAt` | 0.8 |
| `kvcoder.binaries` | `[]` |
| `kvcoder.sessions.keep` | 100 |
