# The coding app

This page is for using kvcoder, the chat-and-agent extension that comes with the `coder` preset. You will be able to start chats, follow what the agent does, approve or deny its commands, answer its questions, read its artifacts, and stop or resume work.

## Chats and sessions

- A **chat** (session) is a conversation with the agent, stored in the current workspace. Home has its own chats; each folder you open has its own.
- The **Chat** page shows the conversation; the left column lists your chats, grouped into Today and Earlier, with a **New chat** button.
- Until the first answer, a chat's title is the start of your first message. kvman then writes a short title for it. You can rename one from the **More** menu (⋯).
- The **More** menu also has **Fork into a new chat** (copy the conversation through a point), **Export as JSON**, **Summarize earlier messages now**, and **Delete the chat**.
- Long chats show **N earlier messages · Export** instead of the full history.

## Sending and stopping

Type in the box at the bottom and press Enter (Shift+Enter for a new line). While the agent works:

- You can send another message; it is queued and the agent reads it after its current step.
- The **Stop** button cancels the turn: the current step, its helpers' turns, and its pending questions. Anything already in the transcript stays; you can send another message to go on.
- After an answer, the conversation shows the turn's time, tokens, and cost, and the header keeps the chat's totals.

## What a turn looks like

A turn is a chain of steps. Each step calls the model, which streams its answer. The agent:

1. Reads your message and the workspace (files, config, tests) — it looks before it assumes.
2. Explains what it is about to do, then makes a call (usually of the shell) — several calls in one reply run at the same time.
3. Shows each call as a card: its title, a one-line description, the command, and the output when opened.
4. Continues until it answers in text, which sends no more calls and ends the turn.

Long answers and results are stored as **artifacts**, not dumped into the chat.

## The shell and its approval

The agent's one tool is a shell: `bash` on Linux and macOS, PowerShell on Windows. Calls run in the workspace folder, and each starts fresh (a `cd` doesn't carry over).

The `kvcoder.shell.approval` setting controls when kvman asks first:

- **auto** (the default) — kvman asks only for calls the model marks **risky** (could lose something or reach outside the workspace). Unmarked calls run at once.
- **ask** — every call asks.

When a call asks, you see a card with the command and its description, with **Allow**, **Deny**, **Allow all** / **Deny all** when several are pending. A denied call returns "denied by the user" to the agent.

Calls time out after 120 s by default (the agent may ask for up to 600 s). When a call ends, any background processes it left are stopped.

## Connectors

Connectors are words the agent can type instead of using the shell. Built in:

- `ask` — asks you a question and waits for your answer (below).
- `subagent` — runs a helper chat that does a self-contained part and reports back.
- `fs` — writes and edits files inside the workspace folder (runs through the same approval as a shell call).
- `artifact` — stores a document you can read (below).
- `jobs` — lists, gets, or cancels background work the chat started.

Other extensions add connectors (kvcustomizer adds `ext`, `preset`, `preview`, `kvman`, and `docs` — see [customizing-with-the-agent.md](customizing-with-the-agent.md)). The agent can also start background work with `--async`, which reports its result back into the chat when it ends.

## Artifacts

When the agent has something for you to read — a plan, a report, a design, a page — it stores it as an **artifact**. The artifact panel opens beside the conversation (one artifact at a time, a row of titles when there are several), with **Preview** and **Source** views, a version number, and a **Copy** button. An update to an open artifact doesn't reopen a panel you closed. The **Artifacts (N)** button in the header opens and closes the panel.

HTML artifacts run in an isolated frame: their scripts work, but they can't reach the network, kvman, or your browser data. A `url` artifact shows a local dev server page (`localhost` or `127.0.0.1`, never kvman itself).

## `ask` questions

When the agent needs a decision, it shows a question card: free text, a choice (pick several, or add your own), or a yes/no confirm. You answer in the card; a later answer fails `kvcoder/QUESTION_NOT_FOUND` if the turn was cancelled meanwhile. Your message in the box also dismisses pending questions and denies pending commands.

## Subagents

The agent can delegate a separate, self-contained part to a hidden helper chat. You see its steps stream in its card, and its questions and approvals show up in your chat. Helpers use the same model and thinking level. A chat's header shows a **Running** chip while background work (helpers, async calls) is going on; open it for each job's time, links, logs, and stop button.

## Attachments

The paperclip button attaches images (PNG, JPEG, GIF, or WebP) from your computer. They are sent with your message to a model that accepts image input; a text-only model refuses them.

## Resuming after a stop or restart

- kvman stopped or crashed mid-turn? The chat shows what happened, and you send a message to continue. Suspended chats (waiting on you) survive restarts.
- While a step runs, the header shows **Working…**, and the activity line tells you what the step is doing; failed model calls retry with **Retrying… (2 of 4)**.
- A chat waiting on you shows **Needs you** in the list and the status bar shows **Waiting for you: N**.
- After a failed turn you get **Retry** and **Choose another model** under the notice.

## Useful settings

On the Settings page, under the kvcoder group: the model a new chat starts with (`kvcoder.model`), its thinking level (`kvcoder.thinking`), shell approval, the shell program, step limits (`kvcoder.maxSteps`), when to summarize a long chat (`kvcoder.compactAt`), and how many chats to keep (`kvcoder.sessions.keep`). See [settings-and-secrets.md](settings-and-secrets.md).

## Next

- [extensions.md](extensions.md)
- [customizing-with-the-agent.md](customizing-with-the-agent.md)
