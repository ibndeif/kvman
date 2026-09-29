# kvman plan

This is the specification. Names, shapes, error codes, defaults, and limits here are exact. Every product-owner decision is recorded as an ADR in `adr/`, and the plan text is corrected to match it.

| File | Covers |
|---|---|
| `01-overview.md` | What kvman is, running it, the home folder, packages, core extensions |
| `02-kernel.md` | Jobs, workers, failures, schedules, storage, workspaces, files, settings, secrets, extensions, presets, localization, kernel API, limits, start and stop |
| `03-sdk.md` | The extension API (`ctx`) |
| `04-http-api.md` | Routes, the envelope, security, the job stream |
| `05-errors.md` | The Problem shape and the kernel's error codes |
| `06-kvwebui.md` | The web app: frame, contributions, view trees, effects, built-in pages |
| `07-kvai.md` | LLM calls, providers, models |
| `08-kvcoder.md` | The coding harness: sessions, steps, bash, connectors, sections, ask, subagents |
| `adr/0001-kernel.md` | Every kernel decision, with the product owner's answers |
| `adr/0002-kvwebui.md` | Every kvwebui decision |
| `adr/0003-kvai.md` | Every kvai decision |
| `adr/0004-kvinterviewer.md` | kvinterviewer (superseded by 0005) |
| `adr/0005-kvcoder.md` | Every kvcoder decision |

## Still to design

1. The remaining core extension: kvdev.
2. The `coder` and `dev` presets.
3. The milestones: the build order and each one's Build and Done-when lists.

There are no open questions.
