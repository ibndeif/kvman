# Building kvman with the agent

This page is for anyone who wants kvman's agent to change kvman itself. When you finish, you can ask it to switch the model, change a setting, add or remove an extension, edit your preset, or build and preview a new extension, and you know which of those need a restart.

The tools for this come from **kvbuilder** ("kvman builder"), which the `coder` preset loads. The agent uses them instead of shell lines, so its work is predictable and checked. You never have to know their names; this page lists them so you can tell what the agent is doing when you read its steps.

## Start with `/build-kvman`

Building kvman starts with you. In the chat's send box, type `/build-kvman` and press Enter, or type what you want after it:

```
/build-kvman add a page for my notes
```

The chat shows **Building kvman is on for this chat**, your request is sent as your message, and the agent starts. With nothing after the command, the message is "I want to change this app." and the agent asks what you want.

- Until you do this, the agent in that chat has none of the tools on this page and knows nothing about changing kvman, so a chat about your own project stays about your project. Ask it to "turn on dark mode" there and it will say it can't.
- It is on for that chat only, and stays on. A new chat starts without it.
- The command works in an open chat and on the Chat page, where it starts a new chat.

## You don't need to know kvman's words

Ask in your own words: "I want a page for my notes", "make the app look calmer". Once building is on, the agent has a guide for this in its prompt, and asks what it still needs to know about the result, such as where something should appear, and not about extensions or settings. It tells you what it will change in plain words on the card that asks you to allow it, shows you a new extension running before it adds it, and tells you how to undo each change.

## What you can ask for

| You say | The agent uses | Applies |
|---|---|---|
| "Use the Claude Sonnet model" | `kvman model-list`, then `kvman model-set` | at once, after you allow it |
| "Turn on dark mode" | `kvman settings-list`, then `kvman settings-set` | at once, after you allow it |
| "Put the setting back" | `kvman settings-reset` | at once, after you allow it |
| "What extensions are running?" | `kvman extensions-list` | — |
| "Install `@acme/notes` 1.2.3" | `kvman extensions-install` | at the next start, after you allow it |
| "Add the notes extension you built to my kvman" | `kvman extensions-install` with the project's folder | at the next start, after you allow it |
| "Remove the notes extension" | `kvman extensions-uninstall` | at the next start, after you allow it |
| "Show me my preset" | `kvman preset-get` | — |
| "Call my app Notes" / "Open on my notes page" | `kvman preset-set` | at the next start, after you allow it |
| "Make me a separate app for my notes" | a new preset saved with `kvman preset-save`, started with `kvman --preset <name>` | when you start it, after you allow the save |
| "Why did that fail?" | `kvman jobs-list`, `kvman jobs-get` | — |
| "What is kvman running right now?" | `kvman health-get`, `kvman workspaces-list`, `kvman processes-list` | — |
| "How many chats do I have?" | `kvman query-get` (a query of an installed extension) | — |
| "Build a notes extension" | `ext new`, `ext check`, `ext test`, `preview start`, then `preview query-get` and `preview command-run` to check it | the preview shows it at once |
| "Write me a preset for a notes app" | `preset new`, `preset check` | when you run it |
| "How do I build on the notes extension?" | `docs list`, `docs get` | — |

The model only offers models you can actually call: those of a provider you have connected, and those of your own servers. Asking for another one fails with a message, and the default model stays as it was.

## What needs a restart

Changes to **extensions** and to the **preset** are saved to your preset file and applied the next time kvman starts, because kvman reads the preset once, at the start. After such a change the agent asks to restart kvman for you (you are asked first, like every change), and the Extensions page shows **Restart kvman to apply** with a **Restart now** button. A restart stops what is running, such as a chat that is still working, a preview, or a server the agent started; the page comes back by itself. A new extension that isn't bundled asks for your trust in the terminal where kvman runs, and kvman waits there for your answer.

If kvman can't start with a change, it puts your preset back as it was and starts again, and the Extensions page says **The last change was undone because kvman couldn't start with it.** The agent reads this too, and fixes the cause.

Changes to the **model** and to **settings** apply at once.

## Approvals

**Every change to kvman asks you first.** Eight commands change the app or save another one: `kvman model-set`, `settings-set`, `settings-reset`, `extensions-install`, `extensions-uninstall`, `preset-set`, `preset-reset`, and `preset-save`. Each call shows a card with what the agent says it is doing, the command, and the exact values, with **Allow** and **Deny**. Nothing changes until you allow it, and a denied call tells the agent "denied by the user". This doesn't depend on your approval setting: `kvcoder.shell.approval` covers shell lines, file changes, and MCP tools, and these eight ask even when it is `auto`.

Everything else on this page runs without asking, because it only reads (the lists, `preset-get`, `query-get`, `docs`), works inside your workspace folder (`ext`, `preset`), or works in the preview's temporary home (`preview`).

What the agent can't do here:

- read, list, or change a secret; an API key is never sent to the model;
- run an arbitrary command of the app: it reaches a command only through a connector that names it;
- open or close a workspace.

## Looking things up

When the agent builds on an installed extension, it reads that extension's own pages with `docs list` and `docs get`. Every installed extension that documents itself, such as kvwebui's views and components or kvcoder's connectors and sections, appears there; so does a project you built with `kvman-new`. The agent never has to guess how an extension works.

## Previewing

`preview start` runs your extension project in a **separate** kvman, with its own temporary home, so nothing touches your real data. It gives a link; open it to try the extension. Edits to the project's files show up live. `preview stop` ends it, and it also stops when your main kvman stops.

The agent checks its own work there: `preview query-get` and `preview command-run` call the project's queries and commands inside the preview, and the agent reads what came back, including an error. These calls never touch your real kvman, so they don't ask you.

## Not using the agent

Everything here also works without it: the Extensions page covers installing and removing, the Settings page covers settings, and the developer documentation shows the command-line tools (`kvman-new`, `kvman-check`, `kvman-preview`, `kvman-docs`) that any editor, terminal, or other assistant can run.

## Next

- [extensions.md](extensions.md)
- [building-extensions.md](building-extensions.md)
- [presets.md](presets.md)
