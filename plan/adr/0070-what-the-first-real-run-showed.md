# ADR 0070 — what the owner's first real run showed: tools that share one connection, a map made after looking, and smaller prompt faults

Status: accepted by the product owner on 2026-10-12, before source. It amends ADR 0020, 4, 7, and 10, ADR 0064, ADR 0065, and ADR 0012, 18.

## Context

The owner asked the running app for "a modern todo list application using native html and javascript" (GPT-6 Luna through OpenRouter; 22 steps, 3.8 minutes, about one cent). The app worked. Reading the chat and trying the app showed these faults:

- **The agent could not test what it built.** Each `mcp call` starts the server and closes it (ADR 0020, 4), so the Playwright server's browser was blank on the call after `browser_navigate`. The agent said so and delivered without trying a single click.
- **The map came before any look.** It was set in the first reply, in an empty folder, with the goal "in the existing project, following its conventions", and three steps that were phases (inspect, implement, verify).
- **The person approved the agent's own new files.** Every `fs write` and `fs edit` came with `risky: true`, so each waited 17 to 30 seconds for an approval.
- **Five calls to learn five tools' arguments**, one `mcp tools { tool }` each.
- **Files left behind.** The Playwright server wrote 10 snapshot and log files into the project's folder, and nothing removed them.
- **The page was hard to read.** The tasks' text was a pale grey on white, and an Arabic task was not laid out right to left.

## Decisions

1. **`mcp run { server, steps: [{ tool, arguments? }], timeoutMs?, risky }`** (asked; chosen over keeping a server running for the chat, which needs kernel work and its own design, and over leaving it). It runs 1 to 20 tools on one connection, in order, so a server that keeps state between tools, such as a browser, keeps it for the whole run.
   - Every tool is checked against the server's tools before the first one runs; an unknown one fails `NOT_FOUND` and nothing runs.
   - The run stops at the first tool that reports an error. The result is each step's text under `## <n>. <tool>`, then, when it stopped early, `[stopped: N steps not run]`, and it is an error result then.
   - It asks as `mcp call` does: when `risky` is true, or when `kvcoder.shell.approval` is `ask`. `timeoutMs` is for the whole run.
   - It is the command `kvcoder.mcp.steps.run`. Its closed line is the server and its tools' names.
2. **`mcp tools { server }` says what each tool takes**: each row is `{ name, description, takes }`, where `takes` is the tool's arguments as a signature, such as `{ url, timeout? }`. The full JSON Schema of one tool is still `tools { server, tool }`.
3. **The map comes after understanding** (the owner, 12 October: "it should be after analyzing, clarifying, exploring, to design the perfect execution map"). The lead's method says: plan only after it understood the request, looked at what exists, and has its answers; never in the first reply. A step is one thing it delivers and can check (a file, a feature, a test run), not a phase such as "implement". This replaces "set it in the same reply as your first call" (ADR 0065, 2 and 11).
4. **What is the agent's own work** (ADR 0012, 18). The prompt says that a new file, and a change to a file it made in this chat, inside the workspace folder, are its own work: `risky` is false.
5. **Finish cleans up.** The Finish step says to delete the temporary files the agent or its tools left in the workspace folder, such as logs, snapshots, and scratch files.
6. **A page is read and tried.** The step on what the person will look at adds: text that is easy to read against its background, and a field or an item that holds the person's own text takes its direction from that text. When the `mcp` connector gives it a browser, the page's main actions are tried with one `mcp run` before it is shown.

7. **A command server runs in a folder of its own** (asked on 13 October, after the rerun: the Finish step's instruction to delete temporary files was not followed, and `.playwright-mcp` stayed in the project; chosen over leaving it to the instruction). Each connection to a command server starts it in a new temporary folder, which is deleted when the connection closes, in place of the workspace folder (ADR 0020, 4). The workspace folder is given to the server in the environment variable `KVMAN_WORKSPACE`. A server that must run in the project names its path in its own `args`.

8. **Two faults of the fourth trial.** The model wrote a shell line where the command goes, three times in four trials: a connector whose one command is `exec` now adds "The command is exec, and what to run goes in its payload." to its unknown-command message. And it asked about `AGENTS.md` twice, with `ask confirm` and then with `risky: true`: the Finish step now says that `risky` is the asking.

9. **The direction of typed text is named exactly.** In the fourth trial's app an Arabic note was laid out left to right: "takes its direction from that text" was too loose. The step now says that every field and every element that shows text the person typed has `dir="auto"`.

## Limits

Within one `mcp run` the agent can't read a result before it chooses the next tool, so a step that needs something a result gives, such as an element's reference, is a second run, which starts a new connection. Decisions 3 to 6 are instructions to the model.

## Verification

Scenarios M2.4-E252 to E258, written before source.
