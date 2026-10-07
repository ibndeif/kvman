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
- **Slash commands.** Type `/` at the start for the chat's own actions: `/compact` (summarize the earlier messages now), `/export`, `/fork`, `/new`, `/prompt` (show the exact prompt of the next step, or go back), and `/rename <title>`. Extensions add their own after these: kvbuilder adds `/build-kvman`, which starts changing kvman itself in this chat ([building-kvman.md](building-kvman.md)). Up and Down choose, Tab completes, Enter runs. A slash command is never sent to the agent. On the Chat page, before a chat exists, only the commands extensions add (such as `/build-kvman`) run, and they start a new chat; the chat's own actions are greyed there. The same actions are in the **⋯** menu of the header.

The agent knows the date and time: each message you send reaches it with the day, date, and time you sent it, in your computer's time zone. What you see in the chat doesn't change.

Each call the agent makes is a card. Its time is the whole wait: the model writing the call, then the call running (open the card for the two parts). A call that failed says **Failed**; the agent reads the error and usually tries another way.

## What a turn looks like

A turn is a chain of steps. Each step calls the model, which streams its answer. The agent:

1. Reads your message and the workspace (files, config, tests) — it looks before it assumes.
2. Explains what it is about to do, then makes a call — several calls in one reply run at the same time.
3. Shows each call as a card: a sentence saying what it does, then the connector and command it used (`fs · edit`) and how long it took. Open the card to see exactly what ran and what came back.
4. Continues until it answers in text, which sends no more calls and ends the turn.

Long answers and results are stored as **artifacts**, not dumped into the chat.

## How the agent works

The agent of a chat is told to work as a lead engineer who owns the result: it decides, plans, and executes, and it scales the process to the task.

- **A small task** (one file, or a few steps) is just done: no plan, no worker.
- **A larger task** goes through six steps:
  1. **Understand.** It reads your request, then the files, config, and tests, and the guides where there are any. It is told never to assume or invent a name, a path, an API, or a behavior.
  2. **Clarify.** When the request is unclear, contradicts the code, or leaves out something that changes the result, it asks you, one question per card, with its recommended option first. It doesn't ask what it can find by looking.
  3. **Plan.** It writes the plan as the artifact `plan`: the goal, the steps as a checklist, what each step uses (a connector or a worker), which steps can run at the same time, and how each is checked. For a large, ambiguous, or risky task it asks you to confirm the plan before it starts.
  4. **Execute.** It works through the steps, running independent ones together, checks each with the project's own checks or tests, and ticks it off in the plan.
  5. **Delegate.** It hands separate, self-contained parts to workers, several at once when they don't depend on each other, and checks what they return.
  6. **Finish.** It treats the work as done when it is ready for production: it does what you asked, handles the errors and edge cases that will happen, follows the project's conventions, passes its checks and tests, and leaves nothing temporary behind.
- **Always.** It decides from evidence (something it read, ran, or was told) and says what it checked and what it didn't. Before it tells you something works, it runs it or requests its address.

These are instructions to a model, not guarantees: read the plan and the call cards, and stop the turn when it goes the wrong way. `/prompt` shows the exact text.

## Connectors: how the agent acts

Everything the agent does goes through a **connector**: a named set of commands. It has no other way to touch your files or your machine. Built in:

- `shell` — runs one line in a real shell, in the workspace folder: `bash` on Linux and macOS, PowerShell on Windows. Each line starts fresh (a `cd` doesn't carry over).
- `fs` — reads, lists, and searches files, and writes and edits them, all inside the workspace folder.
- `artifact` — stores a document you can read (below).
- `ask` — asks you a question and waits for your answer (below).
- `delegate` — hands a self-contained part to a worker, which does it in a helper chat and reports back.
- `background` — checks on, or stops, something the agent left running (below).
- `mcp` — uses the tools of the MCP servers you add (below). It is there only while you have at least one server.

Other extensions add connectors (kvbuilder adds `ext`, `preset`, `preview`, `kvman`, and `docs`, in a chat where you typed `/build-kvman` — see [building-kvman.md](building-kvman.md)), and a preset can add a program on your machine, such as `git` or `gh`, as a connector with the `kvcoder.connectors` setting. A program is a connector like any other: it is in the same list on Coder's page, with the same switch.

## MCP servers

An MCP server gives the agent more tools: your issue tracker, a database, a browser. You add servers yourself; kvman ships with none.

Open **Extensions**, then **Coder**, and press the cog beside `mcp`. **Add a server** asks for:

- **Name** — what the agent calls it, such as `github`. It can't be changed later.
- **Description** — what the server is for. The agent reads it to decide when to use the server.
- **Runs as** — **A command on this computer** (a **Command** such as `npx`, with its **Arguments**, one per line) or **A URL** (a server reached over HTTP).
- **Environment variables** (for a command) or **Headers** (for a URL) — a name and a value each. The values are kept as secrets and are never shown again: a stored one shows **Set**, with **Replace**.

Each server in the list says **Ready · N tools**, **Sign-in needed**, or **Could not connect** with the reason; it is checked when you open the list, after you save it, and with **Check again**. The list is saved for all workspaces or only this one, as the page's switch says; a workspace with its own list uses only that list.

**Signing in.** A server at a URL that needs your account says **Sign-in needed** and has a **Sign in** button. It opens the server's own sign-in in a new tab; when you finish there, the tab comes back to kvman and says **Signed in to \<name\>. You can close this tab.** Back on Coder's page the server turns **Ready**, and **Sign out** forgets the sign-in. If no tab opens, allow pop-ups for kvman and press **Sign in** again. A server that only takes a key needs no sign-in: give the key as a header.

What to know:

- The agent sees your servers' names and descriptions, and asks a server for its tools when it needs them.
- A command server is started for each call and stopped when the call ends, in the workspace folder, so it keeps nothing between calls.
- The agent never signs in for you: when a sign-in has run out and can't be renewed, the call fails and tells the agent you must sign in again.
- A tool call asks you first when the agent marks it risky, or always when approval is set to ask (below), exactly like a shell line.
- Only run servers you trust: a command server is a program on your machine, and a tool's result goes into the conversation, so it is sent to the model.

## Approval

Five kinds of call can change things outside the agent's own work: a shell line, a program such as `git`, writing a file, editing a file, and calling an MCP server's tool. The `kvcoder.shell.approval` setting controls when kvman asks you first:

- **auto** (the default) — kvman asks unless the agent marks the call as not risky. A call is risky when it could lose something that isn't the agent's own work, or reaches outside the workspace.
- **ask** — every such call asks.

One more kind always asks, whatever this setting says: a connector's command that its extension marked as needing your approval. The `kvman` connector's changes to the app are such commands (see [building-kvman.md](building-kvman.md)).

When a call asks, you see a card with its description and the line it would run, or the file it would change, with **Allow**, **Deny**, and **Allow all** / **Deny all** when several are pending. A denied call returns "denied by the user" to the agent. Reading, listing, and searching files never ask.

A shell line times out after 120 s by default (the agent may ask for up to 600 s). When a line ends, anything it left running is stopped.

## Background work

For a dev server or anything else that must keep running, the agent starts the line in the background. The chat's header then shows a **Running** chip: open it for each run's time, its local links, its logs, and a **Stop** button. The agent can read a run's output and stop it too. A background run keeps going when you stop a turn, and ends when it exits, when you or the agent stop it, when you delete the chat, or when kvman stops.

## Artifacts

When the agent has something for you to read — a plan, a report, a design, a page — it stores it as an **artifact**. The artifact panel opens beside the conversation (one artifact at a time, a row of titles when there are several), with **Preview** and **Source** views, its kind and version, and icon buttons to open a page in a new tab, copy, and close. An update to an open artifact doesn't reopen a panel you closed. The artifacts button in the header (an icon with the count) opens and closes the panel.

HTML artifacts run in an isolated frame: their scripts work, but they can't reach the network, kvman, or your browser data. A `url` artifact shows a local dev server page (`localhost` or `127.0.0.1`, never kvman itself).

## `ask` questions

When the agent needs a decision, it shows a question card: free text, a choice (pick several, or add your own), or a yes/no confirm. You answer in the card; a later answer fails `kvcoder/QUESTION_NOT_FOUND` if the turn was cancelled meanwhile. Your message in the box also dismisses pending questions and denies pending calls.

## Workers

The agent can delegate a separate, self-contained part to a worker: another agent that does it in a hidden helper chat. You see its steps stream in its card, which names the worker, and its questions and approvals show up in your chat. A worker gets a shorter set of instructions than the chat's agent: do the one task it was given without re-planning or widening it, check it, and return what it did, the evidence, and what is left. It can't delegate further. A worker the agent left working in the background shows in the **Running** chip too.

kvman comes with five workers: `general` for any separate task, and the specialists `ui-ux`, `architect`, `tester`, and `reviewer`, each with its own instructions. To manage them, open **Extensions → Coder**, and press the cog on the `delegate` row. There you turn a worker off (the agent then no longer sees it), edit its instructions, choose which connectors it may use, give it its own model or thinking level (or leave them the same as the chat), remove it, or add your own. Reset brings the five back.

A worker can also be a coding program installed on this computer: **opencode**, **pi**, or **Claude Code**. Pick its kind when you add it. Such a worker runs the program in your workspace folder with the task, signs in the way the program itself does, and spends on that program's account, not on the chat's. You choose whether kvman asks you before each run or starts at once, how many minutes a run may take (1 to 120), and the program's own options, such as its model. While it runs, the chat shows a card with the worker, the time, and **Stop**; it is also in the **Running** chip, with its output once it ends. The program edits files and runs commands on its own: kvman's approval cards don't cover what it does inside a run. If the program isn't installed, the worker's row says so and the agent isn't offered it.

## Attachments

The paperclip button attaches images (PNG, JPEG, GIF, or WebP) from your computer. They are sent with your message to a model that accepts image input; a text-only model refuses them.

## Resuming after a stop or restart

- kvman stopped or crashed mid-turn? The chat shows what happened, and you send a message to continue. Suspended chats (waiting on you) survive restarts.
- While a step runs, the header shows **Working…**, and the activity line tells you what the step is doing; failed model calls retry with **Retrying… (2 of 4)**.
- A chat waiting on you shows **Needs you** in the list and the status bar shows **Waiting for you: N**.
- After a failed turn you get **Retry** and **Choose another model** under the notice.

## Useful settings

On Coder's page (open **Extensions**, then **Coder**): the model a new chat starts with (`kvcoder.model`), its thinking level (`kvcoder.thinking`), a turn's step limit (`kvcoder.maxSteps`: no limit by default; set a number to cap a turn, or leave it empty for none), when to summarize a long chat (`kvcoder.compactAt`) and how many of its newest messages stay whole when it is (`kvcoder.compactKeep`, 10 by default), and how many chats to keep (`kvcoder.sessions.keep`). The same page lists the agent's **Connectors**, each with a switch that turns it on or off (`kvcoder.connectors.disabled`). The cog beside `shell` opens its own settings: approval (`kvcoder.shell.approval`) and the shell program (`kvcoder.shell.path`); a change is saved as you make it, for all workspaces or only this one, as the page's switch says. See [extensions.md](extensions.md) and [settings-and-secrets.md](settings-and-secrets.md).

## Next

- [extensions.md](extensions.md)
- [building-kvman.md](building-kvman.md)
