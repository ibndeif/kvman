# ADR 0008 — Plan review

Status: accepted, 2026-09-30. A full review of the plan before M1.1, decided with the product owner in eight question rounds and one follow-up round. Where an item changes an earlier ADR, it says so.

## Direction (from the product owner)

- kvman runs locally, like pi or opencode, but it is not a coding agent or a chat bot. It is an OS-like app that each person shapes with extensions and presets, so kvwebui has no fixed chat page or fixed UI.

## Running locally

1. **Start folder.** `kvman` opens the folder it's started from as a workspace (except when that folder is the user's home folder, which is Home). It prints `http://127.0.0.1:<port>/?workspace=<id>`. kvwebui reads that parameter once, keeps it as the tab's workspace, and removes it from the URL. (Refines ADR 0002, 7.)
2. **Second run.** When a kvman already runs for the home, a second `kvman` reads the port from `kvman.lock`, calls the running kvman's `kernel.workspace.open` for its folder over HTTP, prints that workspace's URL, and exits 0. If its `--preset` or `--mode` differ from the running kvman's (`kernel.health.get`), it fails `KVMAN_RUNNING` as before.
3. **Platforms.** Linux, macOS, and Windows, natively.
4. **User presets.** `--preset <name>` finds a bundled preset or `<home>/presets/<name>.json`. A name that matches both fails `VALIDATION_FAILED`.
5. **Browser.** After printing the URL (also on a hand-over), kvman opens it with `xdg-open` (Linux), `open` (macOS), or `cmd /c start ""` (Windows). `--no-open` turns this off.
6. **Windows shell.** kvcoder's tool is `powershell` on Windows and `bash` elsewhere. On Windows it uses `pwsh -NoProfile -Command` when PowerShell 7 is on the PATH, else `powershell.exe -NoProfile -Command` (5.1).
7. **Windows process trees** end with `taskkill /PID <pid> /T /F`; there's no graceful SIGTERM step on Windows. POSIX keeps process groups.
8. **Windows secrets.** `secrets.json` relies on the user profile folder's access rules; mode 0600 is set and tested on POSIX only.
9. **No CI in this phase.** The gates run locally, on the developer's OS.
10. **Connector syntax** is the same in both shells. JSON may also come on stdin: a bash heredoc, or a PowerShell here-string `@' … '@`. kvcoder parses both.

## Kernel

11. **Closing a workspace pauses it.** Workspaces are remembered across restarts. Closing one removes it from the list and pauses it: its queued jobs and schedules wait, its running jobs finish, and calls naming it fail `NOT_FOUND`. Opening the same path again gets the same id and data back, and a schedule that fell due while it was closed runs once.
12. **Interrupted attempts.** An attempt cut off by a stop, or by kvman dying while it ran, fails with the new code `INTERRUPTED`; a worker thread dying is still `WORKER_CRASHED`. The job runs again if it has retries left, otherwise it ends `failed`. (Changes ADR 0001, 52: unfinished jobs no longer always stay queued.) kvcoder registers `kernel.job.failed` to end the turn of a step that failed this way.
13. **Keyed schedules.** `ctx.schedule(name, input, { at | cron, key? })`. A key is unique per extension and workspace; scheduling again with the same key replaces the schedule. Recurring maintenance (kvwebui's effect cleanup, kvcoder's session retention) uses keys.
14. **SDK at runtime.** Extensions list `@kvman/sdk` as a peerDependency. The kernel resolves every extension's `@kvman/sdk` import to its own copy (a Node module resolve hook), so all extensions share one SDK and one zod. An sdk range the kernel's copy doesn't satisfy fails the load with `EXTENSION_INVALID`. Extensions use the SDK's `z`.
15. **Store.** `find(filter, { limit, order? })`, where `order` is `'asc'` (default) or `'desc'` by id, which is creation order. `count(filter)` counts matches. A document or kv value is at most 16 MiB (`TOO_LARGE`).
16. **Logging.** `ctx.log.debug/info/warn/error(message, fields?)` writes to `logs/kvman.log`, tagged with the extension and job id. `--log-level` sets the level (default `info`). `fields` follow the log rule: no payloads, settings values, or secrets.
17. **Setting scopes.** `registerSetting(key, { …, scopes? })`, where `scopes` is `['global']` or `['global', 'workspace']` (the default). Setting a key in a scope it doesn't have fails `VALIDATION_FAILED`. The `kernel.*` keys and `kvwebui.theme` are global only. Preset settings are checked after the extensions load: an unknown key or an invalid value stops kvman with `VALIDATION_FAILED`. A stored value that fails its schema (after an upgrade) is skipped with a logged warning.
18. **Dependencies.** The kernel uses `semver` (pinned) for dependency ranges. npm tests use a tiny in-test registry: an HTTP server serving package metadata and `npm pack` tarballs, with no new dependency.
19. **Distribution.** Published: `kvman` (the bin, with the kernel, the bundled extensions, and the presets inside; `npm i -g kvman`), `@kvman/sdk`, `@kvman/testkit`, and `@kvman/kernel` (which testkit needs; it follows the root version). Bundled extensions aren't published on their own.
20. **TypeScript entries for development.** The manifest may name `kvman.source` (for example `src/index.ts`). For a `path:` extension the kernel loads `source` when present, using Node's type stripping (erasable syntax only); otherwise, and always for npm, it loads `main`.

## kvai

21. **Keys** stay secrets only (ADR 0003, 3 is kept).
22. **Default model.** `kvai.defaultModel` defaults to `null`. Both bundled presets set it to `anthropic/claude-sonnet-5-5` (checked against pi-ai's built-in list in M2.1). A `kvai.complete` with no model and no default fails with the new code `kvai/NO_MODEL`.

## kvwebui

23. **No chat in kvwebui.** The `chat` component and its chunk handling (text, component, and follow chunks) are removed; kvcoder owns its conversation UI as custom components (supersedes ADR 0002, 14, 31, and 33). The injected `kvman` object keeps `stream(jobId)` and `follow(jobId)`, which now reruns the page's queries (and applies effects) when the job ends.
24. **Lent views.** The injected `kvman` object gains `View`, a component that renders any view tree with kvwebui's built-in components. Custom components use it for Markdown, so kvwebui's sanitized renderer stays the only `v-html`.
25. **Navigation.** A new component `link { text, params?, to: { page, params? } }` navigates without a command: `params` fill the text, and `to.params` fill the route. `then: { navigate }` params may use `{ "$output": field }`, read from the command's output.

## kvcoder

26. **Approval** stays `ask` or `auto`: no allow list and no guards in this phase. (Closes the open guard question.)
27. **AGENTS.md** is left to other extensions; kvcoder doesn't read project files into its prompt.
28. **A message while waiting** dismisses the pending questions and denies the pending approvals (the model sees "dismissed by the user" or "denied by the user"). The message is appended, and the next step runs.
29. **Global sections.** `kvcoder.section.set { …, global: true }` stores the section in kvcoder's global store, and it appears in every workspace's prompts. kvdev's project summary becomes the connector command `ext list`.
30. **Reload and dependents.** A hot reload reruns the `kernel.started` handlers of the reloaded extension and of every extension that depends on it, directly or not, in dependency order. (Refines ADR 0001, 90.)
31. **Parallel calls.** All shell and connector calls of one reply start together. Approvals for its shell calls are asked together, and the turn suspends until all are answered.
32. **Retention.** `kvcoder.sessions.keep` defaults to `0`, meaning never delete.
33. **Per-session model.** `kvcoder.session.configure { sessionId, model?, thinking? }` changes them from the next step.
34. **Image attachments.** `kvcoder.message.send` and `.inject` take `fileIds?` (kernel files). Images go to models whose `input` includes `image`; any other file, or an image for a text-only model, fails `VALIDATION_FAILED`.
35. **Loop check.** kvcoder stores the ids of the handler jobs it queues. `message.inject` doesn't start a turn when `ctx.job.rootId` is one of them. Work a handler queues with `execAsync` isn't recognized, and the docs say so.
36. **Shell names.** `kvcoder.bash.approval` becomes `kvcoder.shell.approval`, the bash-result card becomes the shell-result card, and the plan says "shell call" for either shell. `kvcoder.shell.path` overrides the shell lookup on every OS.

## Corrections and small rules (approved together)

37. §3.2 now allows runtime imports of a declared dependency's exported subpaths, matching §1.4 and ADR 0001, 89.
38. M2.4 no longer mentions section pulls; sections are pushed.
39. kvai's usage is `{ input, output, cacheRead, cacheWrite, cost }` in `kvai.complete` and `kvai.usage.get`.
40. `kvcoder.thinking` has kvai's levels, including `minimal`.
41. `kvcoder.model` defaults to `null`, meaning `kvai.defaultModel`.
42. HTTP routes are `/api/commands/:name` and `/api/queries/:name`. A query name on the commands route, or a command name on the queries route, fails `NOT_FOUND`.
43. Superseded ADR items are marked where they stand.
44. `kernel.secrets.set` refuses `async` and schedules with `VALIDATION_FAILED`, so a secret never lands in a job row.
45. A nested sync `ctx.exec` runs on the calling job's worker and takes no extra slot.
46. A cancelled job ends `cancelled` when its handler settles after the abort, or at its timeout.
47. A sync HTTP call whose client disconnects is cancelled.
48. Only async and scheduled jobs have a stream; progress from a sync root job goes nowhere.
49. A `kvman.lock` whose process isn't alive is replaced.
50. Home's id is `home`. `kernel.workspace.open` needs an absolute path to an existing folder (`VALIDATION_FAILED`).
51. The `extension` in `kernel.secrets.*` is the package name, as in `caller.name`.
52. `kernel.started` handlers still running when the 10 s budget ends keep running after HTTP starts.
53. An HTTP body over the target's `maxInputBytes` fails `TOO_LARGE`.
54. `update` or `delete` of a missing id fails `NOT_FOUND`; a transaction's `tx` has `global` too.
55. `kernel.port`, `kernel.workers`, and `kernel.workerConcurrency` apply at the next start.
56. The testkit's fake clock drives the kernel's own timers (retries, schedules, retention, ids), not `Date` inside handlers. Testkit calls take `workspaceId`.
57. A job the UI follows has its effects applied when it ends, like a job it started. Effects are kept in kvwebui's global store, keyed by root job id.
58. `kernel.language` is `en` or `ar`. (Changed by 72: an open list.)
59. Connector output gets the same 30 KB truncation as shell output.
60. A connector word inside a pipe, `&&`, or other shell syntax returns an error explaining that connector calls stand alone; it isn't run in the shell.
61. A subagent uses its parent's model and thinking level.
62. Deleting a session cancels its turn and deletes its subagent sessions.
63. `kvcoder.message.send` sends the chunk `{ type: 'follow', jobId }` for the step it starts, and a session records the job id of its running step.
64. Connectors, session handlers, and global sections are in kvcoder's global store; sessions and other sections are in the workspace store.
65. kvdev starts the preview with the running kvman's Node and entry file (`process.execPath`, `process.argv[1]`).
66. The base prompt says each shell call starts in the workspace folder, so `cd` doesn't carry over.
67. A step job registers `timeoutMs` 1 200 000: parallel calls take up to 600 s, plus the model call.
68. A hot reload starts fresh workers with the new code. Old workers take no new jobs and exit when their jobs end, since ES modules can't be unloaded.
69. **Job point inputs** share one base shape, `{ jobId, rootId, name, caller, workspaceId }`: `kernel.job.failed` adds `problem` and `attempts`, and `kernel.job.cancelled` adds `reason`. (Refines ADR 0001, 84.)

## Follow-up: translations, welcome messages, custom UI

70. **Translating descriptions.** The UI looks up `<name>.description` for settings, commands, and queries, and `<owner namespace>.connectors.<name>.description` for connectors, falling back to the registered English description. A key missing in the current language falls back to `en`, then to the key itself. Text sent to the model stays English.
71. **Notices and notes are display-only.** kvcoder stores a notice as `{ code, params }` and shows it as `kvcoder.notices.<code>`. Neither notices nor notes are sent to the model.
72. **Open language list.** `kernel.language` is any language code (BCP 47, such as `fr` or `pt-BR`) for which a loaded catalog exists; anything else fails `VALIDATION_FAILED`. Catalogs are `locales/<lang>.json`. The language switch lists every language found in the loaded catalogs. Right-to-left languages are `ar`, `he`, `fa`, and `ur`. kvman's own packages ship `en` and `ar`. (Changes item 58.)
73. **Notes.** A new kvcoder message kind, `note`, with content `{ key, params? }`, shown translated and never sent to the model. `kvcoder.note.add { sessionId, key, params? }` is public, returns `{}`, and doesn't start a turn.
74. **Workspace opened.** A new kernel handler point, `kernel.workspace.opened { workspaceId }`, occurs only when a path becomes a workspace for the first time. Home counts as first opened on the first start of a new home. Its handler jobs run in that workspace.
75. **kvcoder's welcome.** At `kernel.workspace.opened`, kvcoder creates a session titled with the key `kvcoder.welcome.title` and adds a note with the `kvcoder.welcome` setting's key. That setting defaults to `kvcoder.welcome.default`, and `null` turns it off. A session's `title` is therefore a string or `{ key }`.
76. **Custom UI in this phase:**
    - **Web scaffold.** `ext new { …, web: true }` adds a Vite library build (`vue` external) of `web/components/*.vue` into `dist/web/components/<name>.js` and `.css`, the `kvman.web` field, a sample component, and a sample page in `<namespace>.ui.get`. Its `web:watch` script rebuilds on change, and `preview start` runs it through `ctx.processes` for projects that have it.
    - **CSS and theme tokens.** kvwebui defines CSS variables (`--kv-color-*`, `--kv-space-*`, `--kv-radius`) for light and dark, and loads `components/<name>.css` beside a component's JS. Extensions style with those variables and logical properties; kvwebui's Tailwind classes aren't available to them.
    - **UI actions.** The injected `kvman` gains `navigate(page, params?)`, `toast(text, params?, level?)`, and `panel(id, open)`.
    - **Web types.** `@kvman/sdk/web` exports the types of the injected `kvman` object and of view trees. It is types only and imports nothing but the SDK.
    - **Reloads.** `kernel.extensions.list` gives each extension a `revision` that grows with every hot reload. kvwebui adds it to component URLs, so a page refresh loads the new code.
