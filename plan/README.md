# kvman plan

This is the specification. Names, shapes, error codes, defaults, and limits here are exact. Every product-owner decision is recorded as an ADR in `adr/`, and the plan text is corrected to match it.

| File | Covers |
|---|---|
| `01-overview.md` | What kvman is, running it, the home folder, packages, core extensions |
| `02-kernel.md` | Jobs, workers, failures, schedules, storage, workspaces, files, settings, secrets, extensions, presets, localization, kernel API, limits, start and stop |
| `03-sdk.md` | The extension API (`ctx`), including logging |
| `04-http-api.md` | Routes, the envelope, security, the job stream |
| `05-errors.md` | The Problem shape and the kernel's error codes |
| `06-kvwebui.md` | The web app: frame, contributions, view trees, custom components, effects, built-in pages |
| `07-kvai.md` | LLM calls, providers, models |
| `08-kvcoder.md` | The coding harness: sessions, steps, the `run` tool, connectors, sections, ask, delegate and its workers, its conversation UI |
| `09-kvcustomizer.md` | The kvcoder extension that customizes kvman: connectors, scaffold, preview, guides |
| `10-testkit.md` | `createTestKernel` |
| `11-presets.md` | The bundled `coder` preset |
| `12-testing.md` | Test layers, crash invariants, benchmarks |
| `13-milestones.md` | The 13 milestones: Read, Build, Done when |
| `adr/0001-kernel.md` | Every kernel decision, with the product owner's answers |
| `adr/0002-kvwebui.md` | Every kvwebui decision |
| `adr/0003-kvai.md` | Every kvai decision |
| `adr/0004-kvinterviewer.md` | kvinterviewer (superseded by 0005) |
| `adr/0005-kvcoder.md` | Every kvcoder decision |
| `adr/0006-kvdev-testkit-presets.md` | kvdev (now kvcustomizer, ADR 0010), the testkit, and the presets |
| `adr/0007-milestones-and-testing.md` | Milestones, benchmarks, crash and UI testing, changesets |
| `adr/0008-plan-review.md` | The full review before M1.1: running locally, platforms, and the fixes it made |
| `adr/0009-implementation.md` | Questions answered while building, milestone by milestone |
| `adr/0011-run-tool.md` | kvcoder's one `run` tool over connectors: the shell as a connector, help, background work, function tools |
| `adr/0010-kvcustomizer.md` | kvdev becomes kvcustomizer: extension development for any harness, managing kvman, the `dev` preset removed |
| `adr/0012-chat-review.md` | What a real chat showed: payload signatures in the prompt and in errors, one question per `ask` call, `sessionId` for the provider's cache, honest background starts |
| `adr/0018-attachments-and-conversation-fixes.md` | Any file as an attachment (saved under `attachments/` in the workspace), the greyed slash list on the Chat page, the header above the artifact panel, and its running time |
| `adr/0019-command-progress-and-summary-minimum.md` | A running chat action's line in the chat (slash command or menu), the blocked send box meanwhile, how a summary by hand ends, and a summary's minimum of 10% of the model's window |
| `adr/0020-kept-messages-connector-configuration-and-mcp.md` | The kept messages as the setting `kvcoder.compactKeep`, a cog and a dialog for a connector's own configuration, and the `mcp` connector: servers over HTTP or a command, their secrets, approval, and OAuth sign-in |
| `adr/0021-delegate.md` | The `delegate` connector in place of `subagent`: workers as the setting `kvcoder.delegate.workers`, the five shipped ones, each worker's own configuration and switch, and the `opencode`, `pi`, and `claude` kinds |
| `adr/0022-lead-prompt-no-welcome-kvman-control.md` | The lead agent's prompt and a worker's, the welcome removed, and the agent's control of kvman: commands that ask the person, installing a workspace project, reading the app's state, and calling queries and a preview's commands |
| `adr/0025-install-by-source.md` | Installing an extension by its source alone: `kernel.extensions.install { source }` with `bundled:<name>`, `npm:<name>@<version>`, or `path:<folder>`, and no name field |
| `adr/0024-restart.md` | Restarting kvman in the same process with `kernel.restart`, `kvman restart` for the agent, a "Restart now" button, and a backup that undoes a change that stops kvman from starting |
| `adr/0023-kvman-init.md` | `kvman init` in place of kvcustomizer's global prompt section: the guide is read on demand, asks what the person wants, and has rules for a person who isn't a developer; the restart command is a later ADR |
| `adr/0017-conversation-review.md` | The conversation view after its first long chat: a call's whole wait, "Failed", menus that close outside, the model in the send box, the artifact header, slash commands, and pasted images |
| `adr/0016-workspace-switch-in-a-chat.md` | A workspace switch while a chat is open: the session page opens the selected workspace's newest chat, or a new chat |
| `adr/0015-configuration-review.md` | The configuration pages after their first use: a model is chosen from a searchable dropdown everywhere, the Interface page has one section, and programs are rows of the one connectors list |
| `adr/0014-extension-configuration.md` | Each extension's configuration on its own page: `configuration` in `ui.get`, the `setting` view, `kvman.scope`, secrets per extension, and turning kvcoder's connectors off |
| `adr/0013-ui-review.md` | The UI review: an answered question's card, the Settings page (one scope switch, saving as you change, named choices, details), and the Arabic glossary |

The plan is complete. Implementation starts with M1.1.
