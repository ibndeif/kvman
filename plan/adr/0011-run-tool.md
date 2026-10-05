# ADR 0011 — kvcoder: one `run` tool over connectors

Status: accepted, 2026-10-05. It changes ADR 0005 and ADR 0009 (81, 88, 93, 96, 100, 143, 149–151, 157–168, 172, 186–188, 212, 213) where they differ.

Asked: "We need to simplify and enhance the kvcoder for better accuracy and performance: replace the bash/shell tool with a `run` tool that runs connector commands (`description`, `connector`, `command`, `payload`). The shell becomes a connector. Each connector has a command to get its help. The connector is the only way to connect the model with the external world. The connectors use `ctx.exec`, so they run in kernel workers. The agent has no access to jobs or processes; for background work it uses the shell connector with a flag." And: "a developer should be able to write tools that don't use kernel jobs", such as a `calculate` function for an agent the extension creates.

## Decisions

1. **One tool, `run`.** `run { description, connector, command, payload }`. `description` (one sentence, for a person who knows nothing about the harness), `connector`, and `command` are required; `payload` is the command's input and defaults to `{}`. `connector` is an enum of the session's connectors. A `payload` sent as a JSON string is parsed. Any other tool name fails `VALIDATION_FAILED` ("the tool is run, not bash"). Chosen over a native tool per command (about 35 tools) and over typed tools for the core commands beside `run`.
2. **The shell is a connector with fixed commands.** `shell exec { line, background?, timeoutMs?, risky? }` runs the whole line in the real shell, so pipes, `&&`, and redirection work. The name is `shell` on every OS. Chosen over `command` as the program with an argument string.
3. **The prompt holds each connector's name and description only.** kvcoder appends `Commands: a, b, help.` from the registration, so the list is never missing or stale. Payload shapes are learned from `help`.
4. **Every connector has `help`.** `help {}` describes the connector and its commands; `help { command }` gives one command's description, input and output JSON Schemas, and examples. `help` is a reserved command name: registering one fails `VALIDATION_FAILED`.
5. **A binary connector is called by its name**, with two commands: `exec { args, background?, timeoutMs?, risky? }` and `help { command? }`. `help` runs `<name> --help`, or `<name> <command> --help`; a registration may give `binary.help`, a line with an optional `{command}` placeholder (`go help {command}`), for a program that differs. Chosen over the subcommand as `command`, and over running binaries only through `shell`.
6. **Background work is a payload flag, followed up through the `background` connector.** Only `shell exec`, a binary's `exec`, and `subagent run` take `background: true`. The built-in connector `background` has `list`, `output { id }`, and `stop { id }` for what this chat started. The `jobs` connector, `--async`, and the private job `kvcoder.connector.run` are removed: every other connector command runs to its end inside the step. The agent never sees a kernel job or the process service.
7. **`risky` is a payload field** of `shell exec`, a binary's `exec`, `fs write`, and `fs edit`; left out, it counts as `true`. `kvcoder.shell.approval` keeps its name and meaning. Chosen over a fifth tool parameter and over the setting alone.
8. **`fs` gains `read`, `list`, and `search`**, inside the workspace folder, never asking:
   - `read { path, fromLine?, lines? }` → `{ path, fromLine, totalLines, content }`: 2000 lines by default, and at most 30 KB of content (whole lines);
   - `list { path? }` → `{ path, entries: [{ name, kind: 'file' | 'folder', bytes }], truncated }`: one folder, not recursive, at most 1000 entries, sorted by name;
   - `search { pattern, path? }` → `{ matches: [{ path, line, text }], truncated }`: `pattern` is a regular expression, at most 200 matches, each line cut at 500 characters, skipping `node_modules`, `.git`, other dot-folders, and files that aren't UTF-8 text.
9. **`ask` and `subagent` are called through `run`.** A kvcoder query checks the payload through `ctx.exec`; the step then records the pending question or child and suspends the turn, as before. `subagent run` loses `shell`: `connectors` is the one list, and `shell` and the binary connectors are in it or not.
10. **Every connector command is a kernel command or query run with `ctx.exec`.** The built-in ones are kvcoder's own private registrations (plan 08 §8.3). Their inputs are strict zod objects with a description on every field, and `help` is built from the registered schemas.
11. **What the model gets back.** A connector command returns its output as JSON indented by 2 spaces, or `error <code>: <message>`. Only `shell exec` and a binary's `exec` return raw output and `[exit code N]`. Output over 30 KB is cut as before.
12. **Old chats stay as stored.** Nothing is migrated, and the history is sent unchanged. The call card shows an old call's command line. A turn that waits on an old-form approval isn't run whatever the answer: its result is `denied by the user` and a line saying to make the call again with `run`. No code that runs an old-form call is kept.
13. **The call card.** Closed, it shows the description, then `connector · command` and the time. Opened, it shows the payload (the line for `shell exec` and a binary's `exec`, its fields otherwise) and the output.
14. **Function tools need no kernel or SDK change.** An extension that runs its own agent loop calls `kvai.complete` and runs its tools as plain functions inside its handler, on the handler's worker, with no job. The kernel's main thread still never runs extension code. The developer documentation gains a page with a full example, kept true by a test. Chosen over an SDK helper, over a registered in-worker function that kvcoder's agent could call, and over running tools on the main thread.

## Confirmed details

15. A binary's `exec` runs the line `<name> <args>` in the real shell, as a binary connector ran before, so quoting works as the model expects.
16. `description` is required and non-blank; a call without one fails `VALIDATION_FAILED` saying what it must be. The title, and the rule that derived one from the description (ADR 0009, 186 and 212), are gone.
17. The content of `fs write` and `artifact write` is the payload's `content` only; the heredoc body form (ADR 0009, 187) is gone with the shell line.
18. `runConnector` in `@kvman/kvcoder/testing` becomes `runConnector(kernel, { connector, command, payload? })`.
19. `kvcoder.job.list`, `.get`, and `.cancel` stay as the person's API for the Running chip; a row's `kind` is `process` or `subagent`.
20. A binary connector's `help {}` describes `exec` and `help` and then prints the program's own help; `help { command: 'exec' }` gives `exec`'s payload, and any other command the program's help for it.
21. The built-in connectors' private names are in plan 08 §8.3. `ask` has one check per command (`kvcoder.ask.text.check`, `.choice.check`, `.confirm.check`), so each has its own schema for `help`.
22. **kvai's stream cap covers any argument value.** A `toolcall` chunk sends `null` for a value over 16 KiB whether it is a string or, as `run`'s `payload` is, an object (its JSON is counted). Before, only a top-level string was capped (ADR 0009, 189), so a large `fs write` would have passed the 64 KiB chunk limit and failed its step. The returned and stored messages keep the whole value. It changes plan 07 §7.1.
23. **`fs read`, `fs list`, and `fs search` are never cut.** They limit their own results (decision 8), and cutting their JSON at 30 KB would break it for a full read or a long listing.
24. **The kernel keeps a registration's JSON Schema once converted.** `kernel.extensions.list` and `kernel.settings.list` converted every schema on each call, and kvcoder reads the extensions at every prompt build; with the built-in connectors' schemas that pushed the `kvcoder.prompt` benchmark past its limit (about 30 ms before, 35 to 43 ms after). Registrations are sealed at load, so the conversion is kept with its schema. Nothing an extension sees changes, and the benchmark is at about 15 ms.

## Consequences

- Removed from kvcoder: the shell-line parser, the heredoc and here-string forms, the refusal of a connector word inside shell syntax, `--async`, the `jobs` connector, and `kvcoder.connector.run`.
- kvcustomizer's connectors keep their names and commands; only how they are called changes.
- Changesets: `@kvman/kvcoder`, `@kvman/kvcustomizer`, and `@kvman/kvai`.
