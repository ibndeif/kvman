# 11 — Self-Extension (the Builder)

## 11.1 Goal

A user describes what they want in plain language, and kvman builds it: a preset, an extension, or both, with pages the user can see and test before publishing. A non-technical user never has to read code. A developer can open and edit everything.

## 11.2 User experience

1. **Describe** — in the Builder app: "I want to upload PDFs and translate them to Arabic."
2. **Plan** — the builder answers in plain words, as a plan card in the chat (the builder's own panel in `agent.chat.prompt`) that the user approves:
   *"I'll add a Files page with upload and a table, a Translate action, and a language setting. It will use your configured AI model. It needs: file storage, AI access. It will not run shell commands or access your folders."*
3. **Preview** — the new pages open in a live preview pane, backed by a sandbox with its own data. The user clicks through them.
4. **Refine** — "put the language picker next to the button", "also show the page count". Each change is validated, tested, and previewed again.
5. **Publish** — the result is installed and added to the user's preset. Every published version can be rolled back with one click.

## 11.3 Escalation ladder

The builder always chooses the **lowest tier** that satisfies the request:

| Tier | Output | Code executed | When |
|---|---|---|---|
| ① Preset | pages, nav, labels, toggles, config in the current preset | none | existing commands, queries, entities, and components are enough |
| ② Extension | a new extension: handlers (TS) + storage + pages and composite components (JSON) + tests | yes, sandboxed | new behavior or data is needed |
| ③ Widget | a sandboxed HTML/JS widget inside that extension | yes, in the browser sandbox | the component library cannot express the UI |

The builder must justify moving up a tier in the plan it shows the user.

## 11.4 Architecture

- The **Builder** is the `agent` extension running under the **Extension Builder** preset: tool mode `direct`, tools from `builder`, and `builder`'s prompt sections (`09` §9.6): the builder guide, the view-language reference, and a summary of the workspace registry (refreshed on `kernel.preset.changed` and `kernel.extension.*` events).
- **`builder`** (package `@kvman/builder`, namespace `builder`, capabilities `kernel.admin`, `ui`, `llm`, `files.read`, `calls: ['agent.prompt.section.*']`, and a subscription to `agent.activated`) provides the tools and the Builder UI. `kernel.admin` covers every kernel command it sends; grant commands still need the person's click in the grant dialog. Types marked *(tool)* are agent tools (`agentTool`, access `all`): the Builder's toolset. Its read tools are queries and its other tools are commands (`02` §2.4); the unmarked types serve the builder's own UI.

| Kind | Type | Purpose |
|---|---|---|
| query (tool) | `builder.schema.search {q, kinds?}` | search types, entities, components, contributions with descriptions and examples |
| query (tool) | `builder.docs.get {topic}` | sections of `docs/llms.txt`, the view language, the extension guide, example extensions |
| command (tool) | `builder.plan.propose {summary, tier, adds, capabilities}` | stores the plan as a pending approval and shows it in the builder's plan card; deferred reply = approval or requested changes |
| command | `builder.approval.answer {approvalId, decision: 'approve' \| 'change' \| 'cancel', note?}` | access `user`: the person's answer to a plan or publish card |
| query | `builder.approvals.list {sessionId?}` | open plan and publish cards (bound by the builder's panels) |
| command (tool) | `builder.project.create {name, tier}` | creates a dev project (from a template for tier ② or a preset draft for ①) with `kernel.dev.project.create` |
| command (tool) | `builder.file.read`, `builder.file.write`, `builder.dir.read` | edit files **inside the dev project only**, through `kernel.dev.file.*` (§11.5) |
| command (tool) | `builder.preset.patch {ops}` | tier ① edits against a preset draft (JSON Patch) |
| command (tool) | `builder.check` | `kernel.dev.build {project, test: false}`: type-check, bundle, and manifest recording and validation → structured issues with fix hints |
| command (tool) | `builder.test` | `kernel.dev.build {project}`: the same plus the project's tests in the sandboxed test process (§11.5) → results; a clean run records a version |
| command (tool) | `builder.preview.start/stop` | hot-loads the dev version into the preview workspace (§11.7) and opens or closes the preview pane |
| command (tool) | `builder.publish {projectId}` | publish flow (§11.8) |
| query, command (tool) | `builder.versions.list`, `builder.rollback {versionId}` | version history of builder projects |

The builder never gets shell access or write access to the person's files. It may read workspace files through `fs`'s read tools (the Extension Builder preset keeps only `fs.file.get`, `fs.dir.list`, and `fs.files.search`, `07` §7.6); its only write surface is the dev project, through the kernel's dev-project commands.

## 11.5 Dev projects and versions

- Location: `~/.kvman/extensions/dev/<project>/` with the standard extension layout (`05` §5.1), created from a template that already contains a passing test (`node:test`) and `locales/en.json`. Extensions cannot write under `~/.kvman` with `ctx.files`, so the project is reached only through **kernel dev-project commands** (admin, `03` §3.8), jailed to that folder like `ctx.files` is jailed to a workspace:
  - `kernel.dev.project.create {name, template: 'extension' | 'preset'}`, `kernel.dev.project.delete {name}` (also forgets its preview workspace);
  - `kernel.dev.file.read/write/list/delete {project, path, content?}` (paths relative to the project; `..`, absolute paths, and symlinks fail `WORKSPACE_ESCAPE`; files up to 1 MB);
  - `kernel.dev.build {project, test?: boolean /* default true */}` → `{ ok, issues, tests?: { passed, failed, results }, versionId? }`.
- **Build** (`kernel.dev.build`, deadline 120 s) runs three stages, each in its own child process that exits when done. The scripts and the toolchain (TypeScript and esbuild) ship in `@kvman/devtools`; the kernel starts them by path and never imports them.
  1. **Compile** (runs no project code): type-check `src/` and `test/` with the TypeScript compiler API using fixed options (strict, ESM, Node 24 target; the project's own `tsconfig.json` is ignored, so it cannot change them), then bundle with esbuild: `src/extension.ts` → `dist/extension.js` (`@kvman/sdk` external) and each `test/<name>.test.ts` → `dist/test/<name>.test.js` (`@kvman/sdk`, `@kvman/testkit`, and `node:*` external). esbuild runs its own native program as a child process, which the permission model would forbid; this stage needs no sandbox because nothing from the project runs in it.
  2. **Record**: the install-time loader records and validates the manifest from `dist/extension.js` (`06` §6.2 steps 4–5).
  3. **Test** (unless `test: false`; 60 s): a devtools script starts a test kernel (`@kvman/testkit`, in-memory SQLite) that loads the project's extension from `dist/` in a normal `sandboxed` host, then starts the **test process**: Node with `--permission`, read access to `dist/` and kvman's own packages, no write access, no child processes, no workers, no addons, and `--no-experimental-sqlite` (`03` §3.5). It runs `dist/test/*.test.js` with Node's built-in test runner (`node:test`); inside it, `createTestKernel()` works in the testkit's remote mode (`05` §5.10) and sends every call to the test kernel over IPC. So code written by a model never runs outside a sandbox and never loads a native addon.

  When every stage passes, the project is snapshotted as the next version `dev:<project>@<n>`.
- **Imports in dev projects**: only `@kvman/sdk` (plus `@kvman/testkit`, `node:test`, and `node:assert/strict` in tests), Node built-ins the extension's capabilities allow, and relative files. No npm dependencies: builder apps stay self-contained, build offline, and carry no third-party code written or chosen by a model. An app that needs a library is exported (`kvman ext pack`), given its dependency by a developer, and published through npm, where its `integrity` is pinned (`07` §7.4).
- The builder writes every user-facing string as a `$t` key and generates catalogs for `en` and the user's language (`ctx.locale`), so a person who builds in Arabic gets an app in Arabic that also works in English.
- Every iteration that builds and passes its tests is recorded as a **version** by `kernel.dev.build`: the project (with `dist/`) is snapshotted (content-addressed) and gets a `dev:<project>@<n>` source. Versions are immutable and can be previewed, published, or rolled back to.
- Preset drafts (tier ①) are versioned the same way.

## 11.6 Validation loop

```
write files ─▶ builder.check (kernel.dev.build, test: false) ─▶ issues? ─yes─▶ fix (LLM) ─▶ check …
                                                               │          (max 5 rounds, then ask the user)
                                                               └─no─▶ builder.test (kernel.dev.build) ─▶ failures? ─▶ fix … ─▶ version ─▶ preview
```

Validation covers: `setup` recording (synchronous, deterministic, only `ext` calls), manifest schema, required descriptions, namespace, capabilities vs. referenced types, view trees and bindings against component schemas, slot `accepts` and component `children` rules, component authority, translation keys and ICU messages (literal user-facing text is an error for generated extensions), referential checks against the workspace registry (plus the project itself), TypeScript type-check, and the dev-project import policy (§11.5). Every issue has a path, a message, and where possible a hint (`did you mean …`, `add ext.requestCapability('calls', { types: ['fs.file.get'] })`).

## 11.7 Preview sandbox

- The dev version runs **sandboxed** (child process with the Node permission model) regardless of any requested isolation.
- It uses a **preview workspace** (`07` §7.1): `builder.preview.start` creates `preview-<project>` with `kernel.workspace.preview.create {name, from: <the builder's workspace>}` on first use, installs the current dev version, and enables it there (sandboxed, without `process`, `network`, or `kernel.admin`; `06` §6.4). The preview has its own data, so it can never touch the user's real data. Sample data can be generated by a `seed` command in the project.
- **What a preview cannot do**: the dev version in a preview is never granted `process`, `network`, or `kernel.admin`, so its calls that need them fail `CAPABILITY_DENIED` there. (Other extensions in the preview keep the grants copied from the builder's workspace, e.g. `llm-providers` for the AI model.) When the plan requests one of them, the plan card says "these parts cannot be tried in the preview"; the project's tests cover them with the testkit's fakes (fake processes, fake provider). `builder.preview.stop` keeps the workspace for the next preview; deleting the project forgets it.
- The preview pane is the real shell loaded in an iframe on the same origin with `?ws=<preview workspace>&embed=1` (`embed` hides the top bar and sidebar, and an embedded shell never stores its workspace as the browser's last-used one, `08` §8.14), so what the user sees is exactly what will ship. It sits in the builder's panel in the `agent.chat.sidebar` slot and can open full-size in a new tab.
- Hot reload (`06` §6.6) applies each new version in about a second.

## 11.8 Publish

```
builder.publish {projectId, versionId}
  1. require: validation clean, tests passing, plan approved
  2. compute the capability diff vs. the currently installed version (or all capabilities if new)
  3. tier ②: stage and install through the normal pipeline (source dev:<project>@<n>, digest verified);
     installing never enables, so nothing runs yet
  4. store a publish approval and show the publish card (in agent.chat.prompt and frame.overlay):
     summary of what changes, "Publish" / "Cancel"; return ctx.defer()
  5. the person's "Publish" click
       tier ②, new extension: opens the shell's grant dialog (08 §8.13) for kernel.extension.enable
               {workspaceId, name, grants}; the dialog shows capabilities with reasons, isolation
               (sandboxed), and the diff; its Confirm sends the command as the user (03 §3.8)
       tier ②, new version of an extension already enabled somewhere: the click sends
               builder.approval.answer {approve} (access user), and builder then sends
               kernel.extension.reload {name, digest} (kernel.admin); if the version needs new
               capabilities, the button opens the grant dialog for kernel.extension.reload
               {name, digest, grants} instead (06 §6.6)
       tier ①: builder.approval.answer {approve} → builder applies the preset patch with kernel.preset.update
               (a patch that enables extensions or changes grants goes through the grant dialog instead)
  6. on kernel.extension.enabled / .reloaded / kernel.preset.changed: record the published version, reply to builder.publish
     "Cancel" or the deadline: the installed but never-enabled version stays inert and is listed for cleanup
```

- Builder-generated extensions stay `sandboxed`. Lowering isolation is a separate explicit action in the Extensions page with a warning.
- Dev-source extensions cannot be put in shareable presets. To share, the user exports the project as a package (`kvman ext pack`) and publishes it to npm or git; the resulting exact source is shareable.
- Rollback: `builder.rollback` or the Extensions page restores a previous published version (`06` §6.7).

## 11.9 Making formats LLM-friendly

- Required descriptions and examples on every type, field, entity, component, and contribution.
- Component names and props follow common UI-kit conventions.
- One `setup` function with one explicit `ext.register*` call per thing; page views as JSON files; no decorators, globals, or naming magic.
- Every container states what it accepts (frame regions, slots, component children), so a wrong placement fails with a hint that names the allowed kinds ("`frame.sidebar` accepts navGroup, navItem, separator; use ext.registerNavItem").
- Errors are specific and actionable.
- `GET /api/v1/schema` and `builder.schema.search` expose everything with JSON Schemas.
- `docs/llms.txt` plus 4–6 complete examples (PDF translator, todo, webhook receiver, dashboard page, form + approval flow, widget).

## 11.10 Guardrails

| Risk | Guardrail |
|---|---|
| Generated code damages data | sandbox preview with separate storage; tests required; unit-of-work atomicity |
| Generated code overreaches | declared capabilities, capability diff approval, sandboxed isolation enforced by the OS |
| Runaway loops or resource use | per-extension concurrency and timeouts; quarantine after repeated crashes |
| Builder edits outside its project | `builder.file.*` confined to the project directory; no shell tool in the Builder preset |
| Bad publish | versions and one-click rollback; data schema compatibility checks |
| Prompt injection through documents | plan and publish approvals are `access: 'user'` commands, and enabling with grants is confirmed only in the shell's grant dialog: the builder can prepare a publish but cannot confirm it or draw the confirmation |

## 11.11 Acceptance

- **Scenario**: in a fresh install with the Extension Builder preset, the prompt "I want to upload PDFs and translate them to Arabic" produces a working tier ② extension with a Files page, upload, a Translate action, streaming progress, and tests, published sandboxed, used from a PDF Translator-style preset, and rolled back successfully.
- **Tier ① scenario**: "Add a page listing my chat sessions with a Compact button" produces only a preset page, no code.
- **Evaluation set**: 10 app requests of increasing difficulty (in `milestones/M6.5-TEST-CASES.md`); target ≥7 reach publish without the user touching code, and 10/10 either succeed or fail with a clear explanation and no side effects.
