# QA 52 — Products on kvcoder, and the fixes from the research build review (ADR 0082)

**Asked.** "Fix all findings and implement the improvements one by one". The findings are those of `docs/reviews/research-app-build-review-2026-10-15.md`.

**The owner chose:**
- a default home page;
- read-only helpers that run queries;
- a key the person adds in the preview;
- one notice and the newest chat for a chat link from another workspace;
- one profile per app, with a short general method;
- lists in the preset to hide screens;
- a one-line approval note;
- both result cards and artifacts;
- a branded installer with its own home, no auto-update, and straight into the app;
- `git init` only;
- fixing the research extension directly.

## Happy path

- **QA52-H1 kvwebui starts without a home page set.** *Given* a test kernel of kvwebui with no `kvwebui.home`, *then* it starts and `kernel.settings.list` gives `kvwebui.home` the value `kvwebui.extensions` from its default, still with `scopes: []`. `extensions/kvwebui/test/settings.test.ts`
- **QA52-H2 The web scaffold type-checks and passes its check.** *Given* `kvman-new --web` in a new folder, *then* `npx tsc --noEmit` exits 0 there, and `src/index.ts` types the `ui.get` handler by its output schema (`z.output<typeof uiOutput>`). `packages/testkit/test/scaffold/kvman-new-web.test.ts`
- **QA52-H3 The scaffold starts a Git repository.** *Given* `git` on the PATH and a folder outside any work tree, *when* `kvman-new` runs, *then*:
  - the project has a `.git` folder and no commit (`git rev-parse HEAD` fails);
  - its `.gitignore` is exactly `node_modules/\ndist/\n`;
  - its output is unchanged.

  `packages/testkit/test/scaffold/kvman-new-git.test.ts`
- **QA52-H4 A read-only helper runs another extension's query.** *Given* a registered connector `notes` with a command `list` → the public query `notes.item.list`, a command `add` → the public command `notes.item.add`, and `asks: true` on a third query, *when* a read-only worker's helper builds its prompt, *then*:
  - the index lists `notes` with `list` only;
  - `run notes list` runs and returns the query's output;
  - `run notes add` is refused with the read-only refusal before any approval.

  `extensions/kvcoder/test/read-only-worker.test.ts`
- **QA52-H5 A chat link from another workspace shows one notice.** *Given* the session page opened on an id that `kvcoder.session.get`, `kvcoder.message.list`, and `kvcoder.artifact.list` all answer `kvcoder/SESSION_NOT_FOUND` for, *then*:
  - exactly one toast `kvcoder.ui.chatNotHere` is shown;
  - the page navigates to the workspace's newest chat from `kvcoder.session.list { limit: 1 }`, or to `kvcoder.chat` when it has none.

  `extensions/kvcoder/test/web/chat-elsewhere.test.ts`
- **QA52-H6 The start screen's approval line is short.** *Given* `kvcoder.approval` `auto`, *then* the Chat page shows "The agent asks you before risky actions." and a "Change" button that navigates to `kvwebui.extension { namespace: 'kvcoder' }`, and none of `kvcoder.ui.approvalNote.*`'s texts. The same holds for `ask` and `never` with their lines. `extensions/kvcoder/test/web/chat-start-words.test.ts`
- **QA52-H7 Home is called Home.** *Given* the tab's workspace `{ id: 'home', name: 'ahmed' }`, *then* the Chat page's heading is "What should we build in Home?"; *given* `{ id: 'w1', name: 'notes' }`, it is "…in notes?". `extensions/kvcoder/test/web/chat-start-words.test.ts`
- **QA52-H8 The execution map states its limits.** *Then* the `execution-map` entry of the prompt's connector index ends with "Limits: goal up to 300 characters; a step's title up to 100, description up to 500, check up to 300; evidence and a note up to 500; 1 to 40 steps." `extensions/kvcoder/test/prompt-index.test.ts`
- **QA52-H9 A preview call by the wrong kind says which to use.** *Given* a preview answer `{ ok: false, problem: { code: 'NOT_FOUND', message: 'There is no command x.y.get.', params: { name: 'x.y.get' } } }` to `command-run x.y.get`, *then* the answer's message is "There is no command x.y.get. If it is a query, run it with preview query-get."; and for `query-get` it adds "If it is a command, run it with preview command-run." `extensions/kvbuilder/test/unit/preview-call.test.ts`
- **QA52-H10 The port row says the run's port.** *Given* the Settings page served on port 3738 and `kernel.port` 3737, *then* the port row shows "This run listens on port 3738."; on 3737 it shows no such line. `extensions/kvwebui/test/web/settings-port.test.ts`
- **QA52-H11 A profile gives the lead another identity and the general method.** *Given* the preset sets `kvcoder.profile` `{ identity: 'You are a research assistant for PhD students.', method: 'general' }`, *then* the lead's prompt:
  - starts "You are a research assistant for PhD students. You work in the folder";
  - has the general method's sentences;
  - has none of "kvman Coder", "Plan.", "execution-map", or "ready for production";
  - doesn't list `execution-map` in the index, and `run execution-map get` answers as for a connector that doesn't exist.

  A helper's prompt starts "You are a research assistant for PhD students. You are doing one task that the lead agent gave you, in the folder". `extensions/kvcoder/test/prompt-profile.test.ts`
- **QA52-H12 A profile's wording replaces the Chat page's.** *Given* `kvcoder.profile` `{ startHeading: 'notes.start', placeholder: 'notes.ask' }`, *then* the heading is `t('notes.start', { workspace })` and the send box's placeholder `t('notes.ask')`. `extensions/kvcoder/test/web/chat-start-words.test.ts`
- **QA52-H13 A preset hides developer screens.** *Given* `kvwebui.nav.hidden` `['kvwebui.settings', 'kvwebui.extensions', 'kvai.models']`, `kvwebui.status.hidden` `['kvai.usage', 'kvwebui.folder']`, and `kvwebui.workspacePicker` `false`, *then*:
  - the nav has neither Settings nor Extensions nor Models;
  - the status bar has neither the folder nor that item;
  - the top bar has no workspace picker;
  - `/kvwebui/settings` still opens the Settings page.

  `extensions/kvwebui/test/e2e/hidden-screens.test.ts`, `extensions/kvwebui/test/web/hidden-status.test.ts` (a contributed status item, with the fake API)
- **QA52-H14 An extension's result card replaces the call card.** *Given* a connector command entry `{ name: 'show', command: 'notes.item.get', card: 'notes.item-card' }`, *when* the agent calls it and it succeeds, *then*:
  - the toolResult's `details.card` is `{ component: 'notes.item-card', payload, output }` with the query's output;
  - the conversation renders a custom view of `notes.item-card` with `{ payload, output }` and no call card.

  `extensions/kvcoder/test/connector-cards.test.ts`, `extensions/kvcoder/test/web/result-card.test.ts`
- **QA52-H15 An extension writes and edits a chat's artifact.** *Given* a chat, *when* another extension calls `kvcoder.artifact.write { sessionId, payload: { id: 'draft', title: 'Draft', content: '# Hi' } }` and then `kvcoder.artifact.edit`, *then* both succeed and `kvcoder.artifact.list` shows `draft` at version 2. `extensions/kvcoder/test/artifact-api.test.ts`
- **QA52-H16 A brand file makes a build plan.** *Given* `{ name: 'Research Assistant', id: 'research-assistant', preset: 'app.json', icon: 'icon.png' }` with a valid `npm:`/`bundled` preset and a 512 px PNG, *then* the plan has:
  - the overlay `{ productName: 'Research Assistant', identifier: 'com.ibndeif.kvman.research-assistant', bundle: { active: true, icon: [...] } }`;
  - `runtime/brand/brand.json` `{ name, id }`;
  - `runtime/brand/preset.json` equal to the preset.

  `test/release/brand-plan.test.ts`
- **QA52-H17 A branded app starts its own kvman and opens straight into Home.** *Given* resources with `runtime/brand/brand.json`, *then*:
  - the start command adds `--home <user>/.research-assistant --preset <resources>/runtime/brand/preset.json`;
  - the session's first `running` (or `joined`) line loads `http://127.0.0.1:<port>/?workspace=home` with no home screen;
  - the brand's name is read from `brand.json` (the window and dialogs take it in `app.rs`, which no test drives, plan 12).

  `packages/desktop/src-tauri/tests/brand.rs`
- **QA52-H18 The builder's guide teaches products.** *Then* the guide (`docs/guide.md`) has each of these:
  - kvcoder helpers for different models;
  - checking a design against the request;
  - asking where the product runs before a system dependency, and npm packages with prebuilt binaries;
  - `kvcoder.profile`, `kvcoder.connectors.disabled`, `kvwebui.nav.hidden`, `kvwebui.status.hidden`, and `kvwebui.workspacePicker`;
  - screen text for the product's user;
  - schedules only while there is work;
  - the project folder in a brief;
  - a scoped name;
  - `pnpm desktop:brand`;
  - a key on the preview's Models page.

  It still fits 16 KB. `building`, `presets`, kvcoder's `connectors` (`card`, the public artifacts), and kvwebui's `components` (Home's name) say their parts. `extensions/kvbuilder/test/guide.test.ts`, `extensions/kvbuilder/test/docs-own.test.ts`, `packages/testkit/test/docs/built-in-guides.test.ts`, `extensions/kvcoder/test/docs.test.ts`, `extensions/kvwebui/test/docs.test.ts`

## Edge cases

- **QA52-E1 A preset still names its own home.** *Given* `kvwebui.home` `kvcoder.chat` in the preset, *then* its value is `kvcoder.chat`, and setting it with `kernel.settings.set` still fails as preset-only. `extensions/kvwebui/test/settings.test.ts`
- **QA52-E2 No Git, or inside a repository: no `git init`.**
  - *Given* a PATH without `git`, *then* `kvman-new` succeeds with no `.git`.
  - *Given* a folder inside a work tree, *then* it makes no `.git` of its own.
  - In both, `.gitignore` is written.

  `packages/testkit/test/scaffold/kvman-new-git.test.ts`
- **QA52-E3 A failed `git init` fails `GIT_FAILED`.** *Given* a `git` on the PATH that answers `--version` and exits 1 for `init`, *then*:
  - `kvman-new --json` exits 1 with `{ code: 'GIT_FAILED' }` and the last lines of its output;
  - the files stay;
  - kvbuilder's `ext new` maps it to `kvbuilder/GIT_FAILED`, with `en` and `ar` texts.

  `packages/testkit/test/scaffold/kvman-new-git.test.ts`, `extensions/kvbuilder/test/unit/run-bin.test.ts`
- **QA52-E4 A read-only helper's binary and MCP calls stay refused.** *Given* a binary connector and the `mcp` connector, *then* a read-only helper's `exec` and `mcp call` are refused, and the binary connector isn't listed. `extensions/kvcoder/test/read-only-worker.test.ts`
- **QA52-E5 A connector registered before this change reads as not a query.** *Given* a stored connector command without `query`, *then* it reads as `query: false`, so a read-only helper doesn't run it. `extensions/kvcoder/test/read-only-worker.test.ts`
- **QA52-E6 Later failures for the same chat show nothing.** *Given* H5, *when* a later read fails `kvcoder/SESSION_NOT_FOUND` for the same id, *then* no second toast shows; a failure of another code still shows its own toast. `extensions/kvcoder/test/web/chat-elsewhere.test.ts`
- **QA52-E7 The approval line hides with the Extensions page.**
  - *Given* `kvwebui.nav.hidden` names `kvwebui.extensions`, *then* the Chat page has no approval line.
  - *Given* the mode is still loading, or fails to load, *then* the line is empty and nothing else is shown.

  `extensions/kvcoder/test/web/chat-start-words.test.ts`
- **QA52-E8 On a phone the send box stays in view.** *Given* the Chat page at 390 × 844 with no chat, *then* the send box's bottom is within the viewport and the page itself doesn't scroll (`document.scrollingElement.scrollHeight <= innerHeight`). `extensions/kvcoder/test/e2e/chat-layout.test.ts`
- **QA52-E9 A profile is preset-only and strict.**
  - *Then* setting `kvcoder.profile` with `kernel.settings.set` fails as preset-only.
  - A preset value with an unknown key, an empty `identity`, or a `method` other than the two fails the start with `VALIDATION_FAILED`.
  - With no profile, the prompts are exactly as before (the `engineering` method and "You are kvman Coder").

  `extensions/kvcoder/test/prompt-profile.test.ts`
- **QA52-E10 A card must belong to its command's namespace.** *Given* a command entry `{ command: 'notes.item.get', card: 'other.card' }`, *then* `kvcoder.connector.register` fails `VALIDATION_FAILED` and stores nothing. `extensions/kvcoder/test/connector-cards.test.ts`
- **QA52-E11 A failed call of a card command keeps the call card.** *Given* the command fails, *then* the result has no `details.card` and the conversation shows the failed call card. `extensions/kvcoder/test/connector-cards.test.ts`, `extensions/kvcoder/test/web/result-card.test.ts`
- **QA52-E12 An artifact write from an extension keeps the limits.** *Given* a chat that already has 20 artifacts, *then* another extension's write of a new id fails `TOO_LARGE`; an unknown `sessionId` fails `kvcoder/SESSION_NOT_FOUND`. `extensions/kvcoder/test/artifact-api.test.ts`
- **QA52-E13 A bad brand file stops the build.** *Then* each of these fails with a message that names its field:
  - a `name` over 60 characters;
  - an `id` that isn't lowercase kebab case;
  - a preset with a `path:` source;
  - a preset that fails the schema;
  - an icon that isn't a square PNG of at least 512 px.

  `test/release/brand-plan.test.ts`
- **QA52-E14 An app without a brand is unchanged.** *Given* resources without `runtime/brand/brand.json`, *then*:
  - the start command is `--pipe --no-open` only;
  - the first `running` line shows the home screen;
  - the title is "kvman".

  `packages/desktop/src-tauri/tests/brand.rs`
- **QA52-E15 Hidden lists accept only full ids.** *Then* `kvwebui.status.hidden` and `kvwebui.workspacePicker` are preset-only (`scopes: []`), and an id that names no item hides nothing and breaks nothing. `extensions/kvwebui/test/settings.test.ts`
