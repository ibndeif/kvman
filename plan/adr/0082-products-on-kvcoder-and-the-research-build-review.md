# ADR 0082 — products on kvcoder, and the fixes from the research build review

Status: accepted by the product owner on 2026-10-15, before source. It amends ADR 0010 (2, 9), ADR 0014 (10), ADR 0016, ADR 0022 (8 and 14), ADR 0027, ADR 0038, ADR 0056 (3 and 4), ADR 0064, ADR 0077 (5), ADR 0080 (4), plan 06 §6.2 and §6.8, plan 08 §8.2 to §8.7, plan 09 §9.2 to §9.4, plan 10, and plan 14.

## Context

The owner used `/build-kvman` on kvman 0.4.1 to build a bilingual PhD research assistant on kvcoder. The review of that chat (`docs/reviews/research-app-build-review-2026-10-15.md`, items RB-01 to RB-28) found three groups of problems:

- **Bugs in kvman.**
  - `ext check` can never pass for an extension that depends on kvcoder or kvwebui, because kvwebui's `kvwebui.home` has no default.
  - The web scaffold fails its own type check.
  - Read-only helpers can't use other extensions' reads.
  - A chat link opened in another workspace shows three identical toasts and an empty page.
  - The start screen's approval note is developer jargon and pushes the send box off a phone's screen.
  - The Home workspace shows as its folder's name.
  - The execution map doesn't state its limits.
  - The preview's call of a query by `command-run` says the name doesn't exist.
  - The Settings page shows the setting's port, not the port the run uses.
- **Gaps for products built on kvcoder.**
  - The agent's identity, its engineering method, and the chat's wording are fixed to coding.
  - Developer screens can't be hidden.
  - An extension can't show its results as its own cards or write an artifact.
  - The desktop app can only start the default preset.
- **The builder's choices.**
  - It nearly rebuilt kvcoder's helpers as "model profiles".
  - It showed a design that contradicted the request.
  - It chose Python libraries found only on the build machine.
  - It left developer connectors on for students, and leaked build-conversation text into the product's screens.
  - It scheduled a recovery job every minute forever.
  - It pointed helpers at the wrong folder.
  - It had no Git repository.

## Decisions

1. **`kvwebui.home` defaults to `kvwebui.extensions`** (asked; chosen over the testkit filling it, and over `kvman-check --preset`). It stays preset-only (`scopes: []`). A preset still names its own home. So `kvman-check`, `createTestKernel`, and any preset that loads kvwebui start without setting it. This amends ADR 0080, 4, which assumed a dependency's settings all have defaults.

2. **The web scaffold type-checks as written.** The scaffold's `<namespace>.ui.get` handler declares its return type as its output schema's (`const uiOutput = z.json()`, `handle: (): z.output<typeof uiOutput> => …`), so a page whose children have different shapes is checked as JSON and not inferred as a union. The web scaffold's test runs `tsc --noEmit` on the new project.

3. **Read-only helpers run other extensions' reads** (asked; the owner added that they must list and read existing files, which they already do through `fs list`, `fs read`, and `fs search`).
   - A registered connector's command whose target is a public **query** runs for a read-only worker's helper and is listed in its prompt.
   - Its command, binary, and `asks` entries stay refused and unlisted. A connector with no such command isn't listed at all.
   - kvcoder keeps `query: true` or `false` on each stored connector command, from `kernel.registrations.list` at registration.
   - MCP calls stay refused. This amends ADR 0056, 3 and 4.

4. **The preview's model** (asked; chosen over sharing the main app's models, and over leaving it). No keys are copied. When the person wants to try a product's chat in the preview, the builder offers to have them add a key on the preview's own Models page. The key then lives only in the preview's temporary home, which is removed when the preview stops (ADR 0009, 125). The builder's final answer says whether the chat was tried.

5. **A chat link from another workspace** (asked; chosen over switching the tab's workspace).
   - When the open chat's id isn't in the tab's workspace (`kvcoder/SESSION_NOT_FOUND` for that id from any of the conversation's reads), the first such failure shows one toast, `kvcoder.ui.chatNotHere` ("This chat isn't in this workspace."). The page then opens the workspace's newest chat, or the Chat page when it has none, as after a workspace switch (ADR 0016).
   - Later failures for the same id show nothing.

6. **The start screen's approval note is one plain line** (asked; chosen over removing it).
   - The new-chat screen shows, for the loaded `kvcoder.approval`:
     - `kvcoder.ui.approvalLine.auto`: "The agent asks you before risky actions.";
     - `.ask`: "The agent asks you before every action that changes something.";
     - `.never`: "The agent acts without asking you.";
     - then the link `kvcoder.ui.approvalLine.change` ("Change"), which opens kvcoder's configuration.
   - While the mode loads, and when it fails to load, the line is empty; the Agent card in kvcoder's configuration keeps the full note (ADR 0077, 5).
   - The line isn't shown at all when `kvwebui.nav.hidden` names `kvwebui.extensions`, since the person can't reach the configuration from the nav.
   - On the Chat page, the heading and these lines scroll inside the conversation column, and the send box stays in view at every width (§8.7's rule for the conversation).

7. **The Home workspace is named "Home".** kvcoder shows the workspace of id `home` as `kvcoder.ui.homeWorkspace` ("Home"; Arabic "الرئيسية"), as kvwebui's picker does, and any other workspace by its name. kvwebui's `components` guide says so for extensions.

8. **The execution map states its limits.** The connector's description in the prompt's index ends with its limits:
   - goal up to 300 characters;
   - a step's title up to 100, description up to 500, and check up to 300;
   - evidence and a note up to 500;
   - 1 to 40 steps.

9. **A preview call by the wrong kind says so.** When the preview answers `NOT_FOUND` whose `params.name` is the name called, kvbuilder adds a sentence to the Problem's message:
   - for `command-run`: "If it is a query, run it with preview query-get.";
   - for `query-get`: "If it is a command, run it with preview command-run."

   Otherwise the answer is the preview's own (amends ADR 0022, 14).

10. **The port row says the run's port.** The Settings page's row for `kernel.port` adds `kvwebui.settings.portThisRun` ("This run listens on port {port}.") when the page's own port isn't the setting's value.

11. **One agent profile per app: `kvcoder.profile`** (asked; chosen over a profile per chat). A preset-only setting (`scopes: []`), default `{}`, a strict object:
    - **`identity`** (optional, 1 to 4000 characters): who the agent is, in the person's terms. It replaces "You are kvman Coder, the lead engineer… a software engineer with long, deep experience". The lead's first line is `<identity> You work <place>.` and a helper's is `<identity> You are doing one task that the lead agent gave you, <place>.` Without it, the lines stay as they are.
    - **`method`**: `engineering` (the default: today's working method) or `general` (asked; chosen over identity only). In `general`, the lead's "How you work" is:
      - understand what the person wants: read everything they sent, attached files too, and what the task touches;
      - ask in one round, with `ask`, what only they can decide;
      - do the task with your connectors and workers;
      - check the result;
      - answer briefly.

      It keeps the rules on evidence, calls in one reply, context, artifacts, asking, checking, short replies, and the final answer. It has no execution map, no step-by-step plan or worker per step, no `AGENTS.md` Commands section, and no "ready for production". The `execution-map` connector isn't offered: it is as if `kvcoder.connectors.disabled` named it. A helper's step "Do it" becomes "Do the task with your connectors, check what you found or made, and fix what is wrong."
    - **`startHeading`** (optional, a translation key): the Chat page's heading in place of `kvcoder.ui.startHeading`, with the same `{workspace}` parameter.
    - **`placeholder`** (optional, a translation key): the new chat's send box text in place of `kvcoder.ui.startPlaceholder`.

    Connectors and helpers stay the settings they are (`kvcoder.connectors.disabled`, `kvcoder.delegate.workers`). Sections still add after the base prompt. A section that sets the agent's role belongs to a product's own preset; the builder doesn't install such an extension into another app.

12. **Hiding developer screens: lists in the preset** (asked; chosen over one switch).
    - `kvwebui.nav.hidden` may also name the built-in `kvwebui.settings` and `kvwebui.extensions`; a hidden page stays reachable by its address.
    - A new preset-only setting, `kvwebui.status.hidden` (default `[]`), lists status items not shown: contributed ones by full id (`<namespace>.<id>`), and `kvwebui.folder` for the built-in workspace folder. The version item always shows.
    - A new preset-only setting, `kvwebui.workspacePicker` (default `true`), hides the top bar's workspace picker when `false`; the tab stays in its workspace (Home, or the start URL's).

13. **Result cards and artifacts from extensions** (asked; both).
    - **Cards.** A commands connector's command entry may have `card`: a custom component of the registering extension, named `<namespace>.<component>` with the namespace of the entry's own `command` (`VALIDATION_FAILED` otherwise). A successful call of it stores `details.card: { component, payload, output }`, where `output` is the command's output. The conversation shows that component with the props `{ payload, output }` in place of the call card. A failed call keeps the call card. The model reads the call's result as before.
    - **Artifacts.** `kvcoder.artifact.write` and `kvcoder.artifact.edit` become public with the connector's input, `{ sessionId, payload }`. An extension may write or edit an artifact of any chat in the job's workspace, with the same limits; the conversation shows it as it shows the agent's.

14. **Branded desktop apps** (asked: a branded installer; its own home; no auto-update; straight into the app).
    - **The brand file.** `pnpm desktop:brand <brand.json>` builds the desktop app for the system it runs on from a brand file `{ name, id, preset, icon }`:
      - `name` is the app's name, 1 to 60 characters;
      - `id` is lowercase kebab case, up to 40 characters;
      - `preset` is a preset file, which must pass the preset schema and use only `bundled` and `npm:` sources (`path:` fails);
      - `icon` is a square PNG of at least 512 px.
    - **The build.** The command prepares the runtime as `desktop:build` does, then writes `runtime/brand/brand.json` (`{ name, id }`) and `runtime/brand/preset.json`, tries the runtime with that preset, and runs `tauri build` with a configuration overlay: `productName` = `name`, `identifier` = `com.ibndeif.kvman.<id>`, the icons made from `icon` with `tauri icon`, and installers turned on.
    - **The app.** An app whose resources hold `runtime/brand/brand.json`:
      - starts kvman with `--home <user folder>/.<id> --preset <resources>/runtime/brand/preset.json` added. Its own home means it never meets a running kvman Coder, and keeps its own chats, keys, and workspaces.
      - shows no home screen: on the `running` (or `joined`) line it loads `http://127.0.0.1:<port>/?workspace=home`.
      - never checks for updates.
      - titles its window and dialogs with `name`.

      A new version is a new installer the owner sends.

15. **The builder's guide adds** (no decision needed):
    - different models for different tasks are kvcoder helpers, each with its own model and thinking level;
    - check a design against the request's own words before showing it;
    - ask where the product will run and who uses it before choosing a dependency on the system, and prefer npm packages with prebuilt binaries, since an `npm:` install runs `--ignore-scripts` and the desktop app brings only Node and npm;
    - a product for people who aren't developers sets `kvcoder.profile`, turns off `shell`, `fs`, `mcp`, and `delegate` programs it doesn't need with `kvcoder.connectors.disabled`, and hides the developer screens with the lists of 12;
    - every text on a screen speaks to the product's user, never about how it was built;
    - a schedule runs only while there is work, and is cancelled when there is none;
    - a helper's brief names the project's folder;
    - a package is published under a scoped name;
    - ship to people who aren't developers with `pnpm desktop:brand`;
    - try the chat in the preview with a key the person adds (4).

16. **The scaffold starts a Git repository** (asked; `git init` only).
    - `kvman-new` writes a `.gitignore` (`node_modules/` and `dist/`).
    - Before `npm install`, it runs `git init` when `git` is on the PATH and the folder isn't inside a work tree (`git rev-parse --is-inside-work-tree` doesn't print `true`). It makes no commit.
    - A `git init` that exits non-zero fails `kvman-new` with the new code `GIT_FAILED`, with the last lines of its output, and keeps the files. kvbuilder's `ext new` fails `kvbuilder/GIT_FAILED`. With no `git`, the step is skipped.
    - The output is unchanged.

17. **The research extension itself** (asked; fixed directly, as the owner's project, not part of kvman):
    - npm-only extraction;
    - plain wording and lighter pages;
    - a recovery schedule only while sources are processing;
    - no scaffold leftovers;
    - a scoped name;
    - a preset with `kvcoder.profile`, hidden developer screens, and no developer connectors.

## Consequences

- An extension that depends on kvcoder now passes `ext check` and its tests unchanged.
- A preset can make kvcoder a non-coding product: its own agent, its own words, and no developer screens. An extension can show its own result cards and artifacts.
- A product reaches people who aren't developers as a desktop app of its own.
- Not covered:
  - a profile per chat (several products in one app);
  - code signing of branded apps;
  - an update feed for branded apps;
  - building every system's installer from one machine.
