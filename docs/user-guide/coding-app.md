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

The send box also holds:

- **The model and the thinking level** of the chat, after the attach button. A change applies from the next step.
- **Files.** Attach them with the paperclip, or paste them from the clipboard. An image (PNG, JPEG, GIF, or WebP) goes to the model as a picture. Any other file is copied into your workspace folder under `attachments/` when you send, and the message names it, so the agent opens it with its file commands. Nothing there is overwritten: a second `notes.md` becomes `notes-2.md`.
- **Slash commands.** Type `/` at the start for the chat's own actions: `/compact` (summarize the earlier messages now), `/export`, `/fork`, `/new`, `/prompt` (show the exact prompt of the next step, or go back), and `/rename <title>`. Up and Down choose, Tab completes, Enter runs. A slash command is never sent to the agent, and it needs a chat: before your first message the list is greyed. The same actions are in the **⋯** menu of the header.

Each call the agent makes is a card. Its time is the whole wait: the model writing the call, then the call running (open the card for the two parts). A call that failed says **Failed**; the agent reads the error and usually tries another way.

## What a turn looks like

A turn is a chain of steps. Each step calls the model, which streams its answer. The agent:

1. Reads your message and the workspace (files, config, tests) — it looks before it assumes.
2. Explains what it is about to do, then makes a call — several calls in one reply run at the same time.
3. Shows each call as a card: a sentence saying what it does, then the connector and command it used (`fs · edit`) and how long it took. Open the card to see exactly what ran and what came back.
4. Continues until it answers in text, which sends no more calls and ends the turn.

Long answers and results are stored as **artifacts**, not dumped into the chat.

## Connectors: how the agent acts

Everything the agent does goes through a **connector**: a named set of commands. It has no other way to touch your files or your machine. Built in:

- `shell` — runs one line in a real shell, in the workspace folder: `bash` on Linux and macOS, PowerShell on Windows. Each line starts fresh (a `cd` doesn't carry over).
- `fs` — reads, lists, and searches files, and writes and edits them, all inside the workspace folder.
- `artifact` — stores a document you can read (below).
- `ask` — asks you a question and waits for your answer (below).
- `subagent` — runs a helper chat that does a self-contained part and reports back.
- `background` — checks on, or stops, something the agent left running (below).

Other extensions add connectors (kvcustomizer adds `ext`, `preset`, `preview`, `kvman`, and `docs` — see [customizing-with-the-agent.md](customizing-with-the-agent.md)), and a preset can add a program on your machine, such as `git` or `gh`, as a connector with the `kvcoder.connectors` setting. A program is a connector like any other: it is in the same list on Coder's page, with the same switch.

## Approval

Four kinds of call can change things outside the agent's own work: a shell line, a program such as `git`, writing a file, and editing a file. The `kvcoder.shell.approval` setting controls when kvman asks you first:

- **auto** (the default) — kvman asks unless the agent marks the call as not risky. A call is risky when it could lose something that isn't the agent's own work, or reaches outside the workspace.
- **ask** — every such call asks.

When a call asks, you see a card with its description and the line it would run, or the file it would change, with **Allow**, **Deny**, and **Allow all** / **Deny all** when several are pending. A denied call returns "denied by the user" to the agent. Reading, listing, and searching files never ask.

A shell line times out after 120 s by default (the agent may ask for up to 600 s). When a line ends, anything it left running is stopped.

## Background work

For a dev server or anything else that must keep running, the agent starts the line in the background. The chat's header then shows a **Running** chip: open it for each run's time, its local links, its logs, and a **Stop** button. The agent can read a run's output and stop it too. A background run keeps going when you stop a turn, and ends when it exits, when you or the agent stop it, when you delete the chat, or when kvman stops.

## Artifacts

When the agent has something for you to read — a plan, a report, a design, a page — it stores it as an **artifact**. The artifact panel opens beside the conversation (one artifact at a time, a row of titles when there are several), with **Preview** and **Source** views, its kind and version, and icon buttons to open a page in a new tab, copy, and close. An update to an open artifact doesn't reopen a panel you closed. The artifacts button in the header (an icon with the count) opens and closes the panel.

HTML artifacts run in an isolated frame: their scripts work, but they can't reach the network, kvman, or your browser data. A `url` artifact shows a local dev server page (`localhost` or `127.0.0.1`, never kvman itself).

## `ask` questions

When the agent needs a decision, it shows a question card: free text, a choice (pick several, or add your own), or a yes/no confirm. You answer in the card; a later answer fails `kvcoder/QUESTION_NOT_FOUND` if the turn was cancelled meanwhile. Your message in the box also dismisses pending questions and denies pending calls.

## Subagents

The agent can delegate a separate, self-contained part to a hidden helper chat. You see its steps stream in its card, and its questions and approvals show up in your chat. Helpers use the same model and thinking level. A helper the agent left working in the background shows in the **Running** chip too.

## Attachments

The paperclip button attaches images (PNG, JPEG, GIF, or WebP) from your computer. They are sent with your message to a model that accepts image input; a text-only model refuses them.

## Resuming after a stop or restart

- kvman stopped or crashed mid-turn? The chat shows what happened, and you send a message to continue. Suspended chats (waiting on you) survive restarts.
- While a step runs, the header shows **Working…**, and the activity line tells you what the step is doing; failed model calls retry with **Retrying… (2 of 4)**.
- A chat waiting on you shows **Needs you** in the list and the status bar shows **Waiting for you: N**.
- After a failed turn you get **Retry** and **Choose another model** under the notice.

## Useful settings

On Coder's page (open **Extensions**, then **Coder**): the model a new chat starts with (`kvcoder.model`), its thinking level (`kvcoder.thinking`), approval (`kvcoder.shell.approval`), the shell program, step limits (`kvcoder.maxSteps`), when to summarize a long chat (`kvcoder.compactAt`), and how many chats to keep (`kvcoder.sessions.keep`). The same page lists the agent's **Connectors**, each with a switch that turns it on or off (`kvcoder.connectors.disabled`). See [extensions.md](extensions.md) and [settings-and-secrets.md](settings-and-secrets.md).

## Next

- [extensions.md](extensions.md)
- [customizing-with-the-agent.md](customizing-with-the-agent.md)
