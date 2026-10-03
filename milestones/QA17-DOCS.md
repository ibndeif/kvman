# QA 17 — the documentation (ADR 0010, 11)

Plain Markdown in the repository, English, written for people. It describes what is built and decided in `plan/`; it never promises more. Each page opens with who it is for and what they will be able to do, uses runnable examples (commands and code that were run), and ends with "Next" links. Links are relative. The testkit's six guides stay short and written for a model; these pages are the full text.

## `docs/developers/` (for people who build extensions, presets, and kvman itself)

| File | Covers | Sources |
|---|---|---|
| `README.md` | The index, who each page is for, and the three ways to work: kvman's own agent, another harness, or by hand | — |
| `getting-started.md` | A tutorial: `npm i -g kvman`, `kvman-new`, run the sample, edit it, see hot reload, `kvman-check`, `npm test`, `kvman-preview`, in about 15 minutes, with or without an AI | plan 01, 09, 10 |
| `anatomy.md` | An extension's `package.json` (`main`, `kvman`, peer dependencies), `source` for `path:`, the entry, namespaces, public and private names, sealed registrations, loading order and failures | plan 02 §2.9, 03 |
| `sdk.md` | Every `ctx` call, with a short example each: registering commands, queries, and settings; `exec`, `execAsync`, `schedule`; the store; files; processes; handlers; logging; `z`; the Problem shape | plan 03, 02 |
| `jobs.md` | Commands and queries, jobs, workers, retries, timeouts, cancel, schedules, "work ends with its job", crash behavior | plan 02 §2.1–2.4, 12 |
| `storage.md` | `ctx.store` kv and collections, workspaces and `global`, transactions, files, settings and secrets | plan 02 §2.5–2.8 |
| `views.md` | `<namespace>.ui.get`, pages, nav, status items, the view tree, forms, effects | plan 06 |
| `components.md` | Custom Vue components: the `web` folder, the import map, CSS variables, `@kvman/sdk/web`, building with Vite | plan 06 §6.4, 09 §9.2 |
| `localization.md` | Catalogs, `en` and `ar`, keys, error texts, right-to-left, "user-facing text is always a key" | plan 02 §2.11, 06 |
| `connectors.md` | Extending kvcoder: connectors, sections, `ask`, subagents, how a registering extension offers fixed points to others | plan 08, 03 |
| `presets.md` | The preset format, bundled and personal presets, settings, `path:` and `npm:`, how an edit applies, `kvman-preset` | plan 02 §2.10, 11, 09 |
| `testing.md` | `createTestKernel`, the fake clock, `restart`, the fake OpenAI server, `kvman-check`, deterministic tests | plan 10, 12 |
| `preview-and-hot-reload.md` | `kvman-preview`, `path:` hot reload, `web:watch`, ports, what a failed reload does | plan 09 §9.3, 02 §2.9 |
| `kernel-api.md` | Every kernel command and query of plan 02 §2.12 with input, output, errors, and an HTTP example | plan 02 §2.12, 04 |
| `http-api.md` | Routes, the envelope, the job stream, security (127.0.0.1, Host and Origin checks), limits | plan 04 |
| `errors.md` | The Problem shape and every kernel error code, with when it happens and what to do; how an extension names its own | plan 05 |
| `publishing.md` | Package layout, `npm:` sources, versions, `@kvman/sdk` peer ranges, trust at the user's start, changesets for this repository | plan 02 §2.9, 01 |
| `architecture.md` | The kernel, workers, SQLite, extensions, presets, the import walls, how a job runs, where code lives in the monorepo (for contributors) | plan 01–03 |
| `contributing.md` | The repository rules a contributor must follow: the gates, the walls, naming, tests, commits | CLAUDE.md |

## `docs/user-guide/` (for people who use kvman)

| File | Covers | Sources |
|---|---|---|
| `README.md` | The index and a five-minute tour | plan 01 |
| `installing.md` | Requirements, `npm i -g kvman`, every `kvman` flag, the home folder, stopping, updating, platforms | plan 01 |
| `first-run.md` | The first start, the terminal output, the browser, trusting an extension, opening a folder | plan 01, 02 §2.6, 2.9 |
| `web-app.md` | The frame, the sidebar, pages, the status bar, narrow screens, the language and direction | plan 06 |
| `workspaces.md` | Home and folders, "Open a folder…", the folder browser, one kvman per home, handing over | plan 01 §1.2, 02 §2.6 |
| `models-and-providers.md` | Connecting a provider with an API key or a plan sign-in, disconnecting, choosing the default model, custom servers | plan 07 |
| `coding-app.md` | Chats, steps, the shell and its approval, connectors, artifacts, `ask`, subagents, attachments, stopping and resuming | plan 08 |
| `extensions.md` | The Extensions page: listing, installing (`npm:` and `path:`), removing, what "Starts after restart" means, settings, trust | plan 06, 02 §2.9–2.10 |
| `presets.md` | What a preset is, `coder`, making your own, `--preset`, how your `coder.json` replaces the bundled one | plan 01, 02 §2.10, 11 |
| `settings-and-secrets.md` | The Settings page, scopes, where secrets are kept, what is never shown or logged | plan 02 §2.8 |
| `customizing-with-the-agent.md` | Asking the agent to change the model, install or remove extensions, edit the preset, build an extension; what needs a restart | plan 09 |
| `building-extensions.md` | A friendly start for people new to code: using the agent to build one, then a pointer to the developer docs | plan 09 |
| `troubleshooting.md` | Every start failure and Problem a person can meet, in plain words, with the fix | plan 05, 01 |
| `privacy-and-security.md` | Local only (127.0.0.1), what leaves the machine (model calls), trust, secrets, logs | plan 01, 02, 04 |

## Rules for every page

- Every command, flag, name, path, and error code is exactly as in the plan or the code.
- Examples are real: commands were run against the build, and code was typechecked or run by a test.
- No page mentions `kvdev` or a `dev` preset except `docs/user-guide/troubleshooting.md` and `docs/developers/publishing.md`, which each have a short "Migrating from kvdev" note.
- Where the plan has an open question or a later phase (`tui` mode, a sandbox), the page says "not in this phase" and nothing else.
