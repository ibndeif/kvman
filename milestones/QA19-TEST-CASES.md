# QA 19 — what a real chat showed (ADR 0012)

Asked: read the chat in the running app, find its issues, and fix them all, confirming each fix. The chat spent 8 of 22 model calls learning payload shapes, read the provider's cache for 34% of its input, got `[exit code 0]` for a background process that crashed, and heard of that crash twice. Decided in ADR 0012 (1–17); plan 07 §7.1 and plan 08 §8.2, §8.3, and §8.5. This file is the contract; every scenario's test name starts with its id. Tests of earlier milestones that asserted the JSON Schema in an error, `Commands:` for one of kvcoder's six connectors, the old prompt sentences, or `[exit code 0]` for a background start are rewritten to the new behavior and keep their ids.

The signatures of kvcoder's six connectors, as the prompt lists them (H1) and as an error gives them (H3):

```
- shell: …
  exec { line, background?, timeoutMs?, risky? }
  help { command? }
- fs: …
  read   { path, fromLine?, lines? }
  list   { path? }
  search { pattern, path? }
  write  { path, content, risky? }
  edit   { path, edits: [{ oldText, newText }], risky? }
  help   { command? }
- artifact: …
  write { id, title, format?: "markdown" | "html" | "url", content }
  edit  { id, edits: [{ oldText, newText }] }
  get   { id }
  help  { command? }
- background: …
  list   {}
  output { id }
  stop   { id }
  help   { command? }
- ask: …
  text    { prompt, placeholder? }
  choice  { prompt, multiple, options: [{ id, label, description? }], other? }
  confirm { prompt, danger? }
  help    { command? }
- subagent: …
  run  { task, mode: "fresh" | "fork", connectors?, background? }
  help { command? }
```

## Happy path

- **QA19-H1 The prompt gives the payloads of kvcoder's six connectors.** *Given* a session with the `todo` fixture and a binary connector `node`, *then* the connector index holds, for `shell`, `fs`, `artifact`, `background`, `ask`, and `subagent`, the line `- <name>: <description>` followed by exactly the command lines above (2 spaces, the name padded to the widest of the connector, the signature), and none of the six has `Commands:`; `todo` is still `- todo: Keep a todo list. Commands: add, wait, fail, list, help.` and `node` is `- node: Node.js. Commands: exec, help.` (`extensions/kvcoder/test/prompt-index.test.ts`)
- **QA19-H2 A signature is written from a JSON Schema.** *Then* `{ a (required), b }` gives `{ a, b? }`; a required array of objects `{ x (required), y }` gives `c: [{ x, y? }]`; an object field with properties gives `d: { p }`; a string enum gives `mode: "fresh" | "fork"`, and an optional one `format?: "markdown" | "html"`; a number, a boolean, an array of strings, and an enum of numbers are their names only; the fields keep the schema's order; an object with no property gives `{}`. (`extensions/kvcoder/test/unit/payload-signature.test.ts`)
- **QA19-H3 An invalid payload returns its problems and the signature.** *When* the model calls `artifact write { name: 'plan', content: 'x' }`, *then* the result is an error whose text starts `error VALIDATION_FAILED: `, names `id`, `title`, and the unrecognized key `name`, and ends `The payload of artifact write is\n{ id, title, format?: "markdown" | "html" | "url", content }`, with no `$schema` and no `"properties"`. (`extensions/kvcoder/test/invalid-payload.test.ts`)
- **QA19-H4 A registered connector's invalid payload returns its signature too.** *When* the model calls `todo add {}`, *then* the error ends `The payload of todo add is\n` and the signature of the fixture's `todo.add` input, with no `"properties"`; `runConnector(kernel, { connector: 'todo', command: 'add', payload: {} })` returns the same text with exit code 1. (`extensions/kvcoder/test/invalid-payload.test.ts`)
- **QA19-H5 The prompt's new sentences.** *Then* the base prompt, in both shells, holds each of these and none of the sentences they replace (`call it before the first time you use a command whose payload you don't know`, `a small, clear change needs no plan`, `call \`ask\` with all the questions in one reply`): (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
  - `Every connector has the command help. A command listed below with its payload needs no help call; for any other command, or for what a field means, call the connector's help with { "command": "<name>" } before the first use.`
  - `Scale the process to the task: a task of one file or a few steps needs no plan, so just do it; a larger one follows these steps.`
  - ``ask: put each question in its own `ask` call, with all the calls in one reply, and use `ask choice` whenever you offer options, your recommended one first.``
  - `Before you say that something runs or works, check it the way the person would: run it, request its address, or run its test; if you couldn't, say what is unchecked.`
- **QA19-H6 The artifact connector's description.** *Then* the index's `artifact` line holds ``when you write a plan, keep it in the artifact `plan` `` and not ``keep your plan in the artifact `plan` ``. (`extensions/kvcoder/test/prompt-index.test.ts`)
- **QA19-H7 Several questions in one reply.** *When* a reply holds `ask choice { prompt, multiple: false, options: [a, b] }` and `ask text { prompt }`, *then* the turn waits on both questions at once (two pending items); once both are answered, the two results reach the model in the call order, as `{ "selected": ["a"] }` and `{ "text": "…" }`. (`extensions/kvcoder/test/questions.test.ts`)
- **QA19-H8 `kvai.complete` passes `sessionId` on.** *Given* a delegate provider, *when* `kvai.complete` is called with `sessionId: 'chat-1'`, *then* the delegate command's input holds `sessionId: 'chat-1'`; and the options kvai builds for pi-ai hold `sessionId: 'chat-1'`. (`extensions/kvai/test/session-id.test.ts`)
- **QA19-H9 kvcoder sends the chat's id.** *Given* a delegate provider as the session's model, *when* a turn runs a step, *then* the `kvai.complete` input holds `sessionId` equal to the chat's id; a compaction and a title of that chat carry the same id. (`extensions/kvcoder/test/model-session.test.ts`)
- **QA19-H10 A background start that still runs.** *When* the model calls `shell exec { line, background: true, risky: false }` for a line that prints `up` and stays alive (the bash form; PowerShell on Windows), *then* the result is `started <id>\nup\n[running]`, it is not an error, and its `details` hold `background: true`, the `jobId`, and no `exitCode`. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-H11 A background start that failed at once.** *When* the line is `echo boom; exit 3`, *then* the result is `started <id>\nboom\n[the process has already ended]\n[exit code 3]`, it is an error, `details.exitCode` is 3, and after the turn the chat holds no background message for that process. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-H12 A background start that ended well.** *When* the line is `echo done`, *then* the result is `started <id>\ndone\n[the process has already ended]\n[exit code 0]`, it is not an error, and no background message is added. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-H13 An empty path is the workspace folder.** *Given* files in the workspace folder, *then* `fs list { path: '' }` returns the same entries as `fs list {}`, and `fs search { pattern, path: '' }` the same matches as `fs search { pattern }`. (`extensions/kvcoder/test/fs-empty-path.test.ts`)
- **QA19-H14 The docs follow.** *Then* `extensions/kvcoder/docs/connectors.md` says that an invalid payload returns each problem and then the payload's signature, and that the prompt lists the payloads of kvcoder's own connectors while a registered connector's are learned from `help`; `extensions/kvai/docs/models.md` lists `sessionId?` among `kvai.complete`'s fields; and neither says that an invalid payload returns the JSON Schema. (`packages/cli/test/docs-chat-review.test.ts`)

## Edge cases

- **QA19-E1 `sessionId` left out.** *When* `kvai.complete` is called without `sessionId`, *then* the delegate's input has no `sessionId` key and the options built for pi-ai have none. (`extensions/kvai/test/session-id.test.ts`)
- **QA19-E2 An empty `sessionId`.** *When* `kvai.complete` is called with `sessionId: ''`, *then* it fails `VALIDATION_FAILED` and no request is made. (`extensions/kvai/test/session-id.test.ts`)
- **QA19-E3 A subagent's calls carry the child's id.** *When* the model calls `subagent run { task, mode: 'fresh' }`, *then* the child's `kvai.complete` input holds the child session's id, which differs from the parent's. (`extensions/kvcoder/test/model-session.test.ts`)
- **QA19-E4 A schema with no signature.** *Then* a schema that is a union (`anyOf`), one with `type: "string"`, and an object without `properties` each have no signature; and the invalid-payload text for such a schema ends `The payload of notes add is (JSON Schema):\n` and the schema on one line, without `$schema`. (`extensions/kvcoder/test/unit/payload-signature.test.ts`)
- **QA19-E5 A problem at the payload's root.** *Then* the invalid-payload text for an issue with an empty path reads `payload: <message>`, and several issues are joined by `; ` before the full stop. (`extensions/kvcoder/test/unit/payload-signature.test.ts`)
- **QA19-E6 A call that asks is checked the same way.** *When* the model calls `fs write { file: 'a.txt', content: 'x' }`, *then* no approval is asked, nothing is written, and the error ends `The payload of fs write is\n{ path, content, risky? }`. (`extensions/kvcoder/test/invalid-payload.test.ts`)
- **QA19-E7 A background process killed at once.** *When* the line is `kill -9 $$` (bash; the test is the Linux and macOS branch, since Windows reports no signal), *then* the result is `started <id>\n[the process has already ended]\n[killed by SIGKILL]`, with no `[exit code` line, it is an error, `details` hold no `exitCode`, and no background message is added. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-E8 An exit after the startup second is still a message.** *Given* a background line that stays alive past its start and then exits with code 2, *then* its start result ends `[running]`, and the chat gets the background message `The process exited with code 2.` with its last output, as before. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-E9 The record decides.** *Then* the start result built from a record with no end is `[running]`; from a record ended `exited` with code 1, `[the process has already ended]` and `[exit code 1]`; from one ended `exited` with no code and signal `SIGTERM`, `[killed by SIGTERM]`; and from one ended `person`, `[the process has already ended]` with no code line and no error. (`extensions/kvcoder/test/unit/line-run-text.test.ts`)
- **QA19-E10 `starting` and older records.** *Then* a process record stored before this change, with no `starting`, is read without error; an exit is reported by a background message for a record with no `starting` and for one with `starting: false`, and isn't for one with `starting: true`. (`extensions/kvcoder/test/unit/line-run-text.test.ts`)
- **QA19-E11 An empty path elsewhere.** *Then* `fs read { path: '' }`, `fs write { path: '', content: 'x', risky: false }`, and `fs edit { path: '', edits, risky: false }` each fail `VALIDATION_FAILED`, and nothing is written. (`extensions/kvcoder/test/fs-empty-path.test.ts`)
- **QA19-E12 A subagent's index.** *When* a child is given `connectors: ['fs']`, *then* its prompt lists `fs` and `ask` with their command lines and holds no line for `shell`, `artifact`, `background`, or `subagent`. (`extensions/kvcoder/test/prompt-index.test.ts`)
- **QA19-E13 A binary connector's `exec` in the background.** *Given* a binary connector `node`, *when* the model calls `node exec { args: '-e "process.exit(4)"', background: true, risky: false }`, *then* the result ends `[the process has already ended]\n[exit code 4]` and is an error. (`extensions/kvcoder/test/background-start.test.ts`)
- **QA19-E14 Help is unchanged.** *Then* `fs help { command: 'write' }` still holds the payload's indented JSON Schema with a description on every field. (`extensions/kvcoder/test/connector-help.test.ts`)
