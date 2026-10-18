# The coding app

This page is for using kvcoder, the chat-and-agent extension that comes with the `coder` preset. When you finish, you can start chats, send messages and files, read what the agent does, answer its questions and approvals, read its artifacts and its plan, and stop or resume work.

How the agent decides what to do, and the tools it uses, are on their own page: [the-agent.md](the-agent.md).

## Chats

- A **chat** is a conversation with the agent, stored in the current workspace. Home has its own chats, and so does each folder you open.
- The **Chat** page asks "What should we build in *workspace*?" and shows one line on how the agent asks for approval, such as "The agent asks you before risky actions.", with **Change**, which opens the setting. Write there to start a new chat.
- The left column lists your chats, grouped into Today and Earlier, with **New chat**. The open chat's row is tinted and its title is heavier. A chat waiting for you shows **Needs you**.
- Until the first answer, a chat's title is the start of your first message. kvman then writes a short title for it.
- The **⋯** menu in the header has **Rename**, **Fork into a new chat** (a copy of the conversation up to a point), **Export as JSON**, **Summarize earlier messages now**, and **Delete the chat**.
- A link to a chat of another workspace says "This chat isn't in this workspace." and opens this workspace's newest chat.

## Sending and stopping

Type in the box at the bottom and press Enter. Shift+Enter starts a new line. While the agent works:

- You can send another message. It is queued, and the agent reads it after its current step.
- **Stop** cancels the turn: the current step, its workers' turns, and its pending questions. What is already in the conversation stays, and you can send another message to go on.

The agent knows when you wrote: each message reaches it with the day, date, and time you sent it, in your computer's time zone.

## The send box

- **The model and the thinking level** of the chat sit after the attach button. Each opens a list above the box. A change applies from the next step, and the model you pick becomes the default for new chats too. The thinking list shows the levels the chosen model has, up to **Extra high** and **Max** where it has them; picking a model without the current level moves it to the nearest one, and a model that doesn't think shows **Off** greyed.
- **Files.** Attach them with the paperclip, or paste them. In the desktop app on Linux, Ctrl+V with a copied image attaches it.
  - An image (PNG, JPEG, GIF, or WebP) goes to the model as a picture, and the model is told its name and that it isn't a file in your folder. A model that takes no images refuses it.
  - Any other file is copied into your workspace folder under `attachments/` when you send, and the message names it, so the agent opens it with its file commands. Nothing there is overwritten: a second `notes.md` becomes `notes-2.md`.
- **Slash commands.** Type `/` at the start of the box: `/compact` (summarize the earlier messages now), `/export`, `/fork`, `/new`, `/prompt` (show the exact prompt of the next step), and `/rename <title>`. Extensions add their own after these, such as `/build-kvman` ([building-kvman.md](building-kvman.md)). Up and Down choose, Tab completes, and Enter runs. A slash command is never sent to the agent. On the Chat page, before a chat exists, only the commands that extensions add run, and they start a new chat.

## Reading a turn

A turn is a chain of steps. In each step the model answers, and its answer may hold calls, which run before the next step. The turn ends when the agent answers in text alone.

- **While it works**, the line at the end of the conversation says what the step is doing, then the turn so far, such as "Turn: 18 steps · about $0.84". A failed model call is retried by itself, up to five tries, and the line says why and when, such as **Retrying in 15 s: the provider is limiting calls (3 of 5)**.
- **Each call is a card.** Closed, it shows what the agent says it is doing, then one line with what was done and the outcome, such as `Edit src/app.ts +12 −3` or `$ npm test`, and the time it took, from the model writing the call to its end. Open it to see the diff, the output, or the fields. A call the agent judged risky has the chip **Risky**.
- **A failed call** has a red border, **Failed**, and one short reason, such as "The command failed." or "You denied this call.". **Show details** shows the raw error. A request of the agent's that wasn't valid ran nothing: it shows **Not run**, without the red, and the agent usually corrects it in its next step.
- **After the answer**, the conversation shows the turn's time and cost. Hover for its tokens.

The header shows the chat's time, its cost, and **Memory**, how full the model's memory is now: "44 min · $1.72 · Memory 15% full". Hover either for the tokens. If a chat can't be loaded, the page says why and offers **Try again** and **Export as JSON**.

## Approvals and questions

- **An approval** shows each call the agent wants to run: its description, its line or the file it would change, and **Deny** and **Allow** in a row under it. With several pending, **Deny all** and **Allow all** close the card. A denied call tells the agent "denied by the user". When kvman asks is the setting `kvcoder.approval` ([the-agent.md](the-agent.md#approval)).
- **A question** is a card with free text, a choice (pick one or several, or write your own), or yes or no. Before larger work, the agent asks you this way to agree to its plan. A question you skip shows **Skipped**.
- A message you send in the box also dismisses the pending questions and denies the pending calls.

## The panel: artifacts and the execution map

When the agent has something for you to read (a report, a design, a page), it stores it as an **artifact**. When it plans larger work, it draws an **execution map**. Both show in the panel beside the conversation.

- **One thing at a time.** The panel's header shows the title of what it shows. With several things (the map counts as one), the title is a button that opens the list of them.
- **Updates show themselves.** When an artifact or the map is new or changes, the panel opens on it, also after you closed it. The artifacts button in the header (an icon with the count) opens and closes the panel.
- **Width.** Drag the panel's edge beside the conversation, or focus it and press Left or Right. A double-click returns to the starting width. The width goes from 20 rem to 70% of the chat area, and your browser keeps it for every chat. On a narrow screen the panel opens over the conversation.
- **An artifact** has **Preview** and **Source**, its kind and version, and buttons to open a page in a new tab, copy, and close. An HTML artifact runs in an isolated frame: its scripts work, but they can't reach the network, kvman, or your browser's data. A `url` artifact shows a page of a local server (`localhost` or `127.0.0.1`).
- **Diagrams.** A fenced `mermaid` block, in an artifact or an answer, is drawn as a diagram.
- **The execution map** is the agent's plan as a diagram of steps. Press a step to open its details. See [the-agent.md](the-agent.md#the-execution-map).

## Background work

When the agent leaves something running, such as a dev server, the chat's header shows a **Running** chip. Open it for each run's time, its local links, its logs, and **Stop**. A background run keeps going when you stop a turn. It ends when it exits, when you or the agent stop it, when you delete the chat, or when kvman stops.

When a worker program's run changes what is staged in Git, its card and its row in **Running** say so, with **Restore staging**, which puts the staging area back as it was before the run. It changes no file and no commit. A run that moved `HEAD` (a commit, a checkout, a reset) can't be restored this way, and its card says so.

## Long chats

A model can hold only so much. When a chat reaches 60% of the model's memory (`kvcoder.compactAt`), its earlier messages are summarized; the newest 10 stay whole (`kvcoder.compactKeep`). kvman adds what it knows for certain to the summary: your own messages, the execution map, the files the chat changed, what still runs, and the artifacts. So the agent goes on without reading everything again. A long chat shows **N earlier messages · Export** in place of its full history.

## After a stop, a failure, or a restart

- If kvman stopped or crashed in the middle of a turn, the chat shows what happened. Send a message to go on. A chat waiting for you survives a restart.
- After a failed turn you get **Retry** and **Choose another model** under the notice.
- The status bar shows **Waiting for you: N** when chats wait for you.

## Useful settings

Open **Extensions**, then **Coder**. The **Agent** card holds the model a new chat starts with (`kvcoder.model`), the **Model for workers** (`kvcoder.delegate.model`: the chat's own by default), and **Approval** (`kvcoder.approval`). The page also holds the thinking level (`kvcoder.thinking`), a turn's step limit (`kvcoder.maxSteps`, none by default), when a chat is summarized (`kvcoder.compactAt`) and how many messages stay whole (`kvcoder.compactKeep`), how many chats to keep (`kvcoder.sessions.keep`), and the **Connectors**, each with a switch. Every change is saved as you make it, for all workspaces or only this one, as the switch at the top of the page says. See [extensions.md](extensions.md) and [settings-and-secrets.md](settings-and-secrets.md).

## Next

- [the-agent.md](the-agent.md)
- [building-kvman.md](building-kvman.md)
