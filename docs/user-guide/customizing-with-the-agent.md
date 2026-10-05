# Customizing kvman with the agent

This page is for anyone who wants kvman's agent to change kvman itself. When you finish, you can ask it to switch the model, change a setting, add or remove an extension, edit your preset, or build and preview a new extension, and you know which of those need a restart.

The tools for this come from **kvcustomizer**, which the `coder` preset loads. The agent uses them instead of shell lines, so its work is predictable and checked. You never have to know their names; this page lists them so you can tell what the agent is doing when you read its steps.

## What you can ask for

| You say | The agent uses | Applies |
|---|---|---|
| "Use the Claude Sonnet model" | `kvman model-list`, then `kvman model-set` | at once |
| "Turn on dark mode" | `kvman settings-list`, then `kvman settings-set` | at once |
| "Put the setting back" | `kvman settings-reset` | at once |
| "What extensions are running?" | `kvman extensions-list` | — |
| "Install `@acme/notes` 1.2.3" | `kvman extensions-install` | at the next start |
| "Remove the notes extension" | `kvman extensions-uninstall` | at the next start |
| "Show me my preset" | `kvman preset-get` | — |
| "Build a notes extension" | `ext new`, `ext check`, `ext test`, `preview start` | the preview shows it at once |
| "Write me a preset for a notes app" | `preset new`, `preset check` | when you run it |
| "How do I build on the notes extension?" | `docs list`, `docs get` | — |

The model only offers models you can actually call: those of a provider you have connected, and those of your own servers. Asking for another one fails with a message, and the default model stays as it was.

## What needs a restart

Changes to **extensions** and to the **preset** are saved to your preset file and applied the next time kvman starts, because kvman reads the preset once, at the start. After such a change the agent tells you to restart kvman, and the Extensions page shows **Restart kvman to apply**. Press Ctrl+C in the terminal and run `kvman` again. A new extension that isn't bundled asks for your trust at that start.

Changes to the **model** and to **settings** apply at once.

## Approvals

Your approval setting, `kvcoder.shell.approval`, decides when the agent asks before a shell line or a file change: `auto` (the default) asks unless the agent marks the call as not risky, and `ask` asks every time. The connectors on this page run without asking; a change they make to your extensions or your preset applies only when you restart kvman, so you can read it on the call's card first. Nothing the agent does here reads or changes a secret, and an API key is never sent to the model.

## Looking things up

When the agent builds on an installed extension, it reads that extension's own pages with `docs list` and `docs get`. Every installed extension that documents itself, such as kvwebui's views and components or kvcoder's connectors and sections, appears there; so does a project you built with `kvman-new`. The agent never has to guess how an extension works.

## Previewing

`preview start` runs your extension project in a **separate** kvman, with its own temporary home, so nothing touches your real data. It gives a link; open it to try the extension. Edits to the project's files show up live. `preview stop` ends it, and it also stops when your main kvman stops.

## Not using the agent

Everything here also works without it: the Extensions page covers installing and removing, the Settings page covers settings, and the developer documentation shows the command-line tools (`kvman-new`, `kvman-check`, `kvman-preview`, `kvman-docs`) that any editor, terminal, or other assistant can run.

## Next

- [extensions.md](extensions.md)
- [building-extensions.md](building-extensions.md)
- [presets.md](presets.md)
