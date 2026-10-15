# Review: building a research assistant with /build-kvman

**Date: 15 October 2026. Status: every item is fixed or implemented, with the owner's decisions recorded in ADR 0082 and the plan corrected; the scenarios are `milestones/QA52-TEST-CASES.md`.**

| Items | How they were resolved |
|---|---|
| RB-01 | `kvwebui.home` defaults to `kvwebui.extensions` |
| RB-02, RB-27 | the scaffold's `ui.get` is typed by its output schema; `kvman-new` writes a `.gitignore` and runs `git init` (`GIT_FAILED`) |
| RB-03 | read-only helpers run registered connector commands whose target is a query (`query` stored per command) |
| RB-04 | the guide and `building` say how to try a chat in the preview: a key the person adds on its Models page |
| RB-05 | one "This chat isn't in this workspace." notice, then the newest chat |
| RB-06, RB-07, RB-08 | one plain approval line with "Change"; the send box stays in view on a phone; Home is "Home"; the status bar stays one line |
| RB-09, RB-10, RB-11 | the map's limits in its description; the preview's wrong-kind hint; the Settings port line |
| RB-12 to RB-14 | `kvcoder.profile` (identity, `general` method with no execution map, heading, placeholder), preset-only |
| RB-15 | built-in pages in `kvwebui.nav.hidden`, `kvwebui.status.hidden`, `kvwebui.workspacePicker` |
| RB-16, RB-17 | a connector command's `card`; public `kvcoder.artifact.write` and `.edit` |
| RB-18 | `pnpm desktop:brand <brand.json>`: its own home, straight into Home, no updates, its name on the window |
| RB-19 to RB-26, RB-28 | the builder guide's product rules; in the research extension: npm-only extraction in worker threads, plain screen texts, no duplicate navigation, a recovery schedule cancelled when idle, scaffold leftovers removed, the name `@ibndeif/research`, and a preset with the profile and hidden screens |

## What was reviewed

- **The chat.** "Making Changes to the App" (`01a13dca-f2da-7742-a87e-8bfa0cf5715d`) in the workspace `~/ibndeif/kvapps/kvman-extensions/research`, 07:21 to 09:07 local time, with its six helper chats. The owner asked for a PhD research assistant built on kvcoder. The chat ended with a saved preset, `research-app`.
- **Versions.** kvman 0.4.1 (kvbuilder 0.3.2, kvcoder 0.1.8, testkit 0.1.5), so ADR 0080 was in effect. The model was `openai/gpt-6.1-sol` with high thinking.
- **Size.** One turn of 261 steps over 106 minutes, costing $6.00, of which the helpers spent $2.30. The chat header and the workspace total show this correctly: a helper's usage is added to its parent and kept apart in `usageBy.helpers`.
- **How the review was done.**
  - Read the whole transcript and the helper transcripts from `~/.kvman/kvman.db`, read-only.
  - Read the code the findings point to.
  - Looked at the running preview (port 3738) in English, Arabic, and at phone width, and at the chat in the owner's app (3737), only reading.
  - Read the preview's log (no warnings) and the research extension's source.

## Summary

The builder followed the rules of ADR 0080:
- it didn't edit kvman, and used `extensions-get` for real schemas;
- it installed exact dependencies and built on kvcoder's connectors, sections, and helpers;
- it tested in a separate preview with a browser, asked before changing the running app, and said honestly what was untested.

The problems fall into three groups:
1. **Bugs in kvman.** Most important, `ext check` can never pass for an extension that depends on kvcoder or kvwebui (RB-01).
2. **Gaps in what kvman lets an extension shape.** kvcoder can be extended but not turned into another product: its identity, its wording, and its developer screens are fixed (RB-12 to RB-18).
3. **The builder's own choices.** These are fixable through its guide. The most serious is a dependency on Python libraries that will block shipping (RB-21). Build-conversation text also leaked into the product's screens (RB-24).

## How to read the items

- **Priority:** High blocks the goal or misleads; Medium hurts quality or experience; Low is polish.
- **Evidence:**
  - *chat*: seen in the transcript;
  - *code*: confirmed by reading the code;
  - *UI*: seen in the running preview or app;
  - *review*: a code-review judgment, not reproduced.
- **Decision:** *yes* means the plan doesn't settle it and the owner chooses before any code (CLAUDE.md §1); *no* means a plain bug or a guide change.

## 1. Bugs in kvman

### RB-01: `ext check` fails for every project that depends on kvcoder or kvwebui
**High · chat, code · Decision: yes (how the value is supplied)**
- **What happens.** Since ADR 0080, `kvman-check` and `createTestKernel` load a project's declared dependencies. kvcoder depends on kvwebui, whose `kvwebui.home` has no default, so loading stops with "The setting kvwebui.home has no default, so the preset must set it". `kvman-check` takes no settings, so it can't pass. `createTestKernel` passes only when the test gives `settings: { 'kvwebui.home': … }`, which the scaffold's test doesn't.
- **Effect.** All five `ext check` runs failed. The agent and all three implementation helpers worked around a "known platform limitation", and the agent had to ask the owner to approve weaker checks (#151).
- **Cause.** My ADR 0080 tests used fake dependency packages with no required settings, so they never loaded kvwebui.
- **Options.**
  - The test kernel and the checker give a dependency's preset-only setting the value the preview already uses (`kvwebui.home: kvwebui.extensions`).
  - `kvman-check` takes a preset file.
  - kvwebui's `kvwebui.home` gets a default.
- **How we check.** A scaffolded project that declares `@kvman/kvcoder`, installed from packed tarballs, passes `npm run check` and `npm test` unchanged.

### RB-02: the web scaffold fails its own type check
**High · chat, code · Decision: no**
- **What happens.** `kvman-new --web` writes a `ui.get` whose page mixes a `markdown` child and a `custom` child. TypeScript infers a union with `component?: undefined`, which isn't assignable to `z.json()`'s output, giving TS2322 at `src/index.ts:36`. The agent fixed it by wrapping the value in `z.json().parse(...)`.
- **Why tests missed it.** `test/scaffold/kvman-new-web.test.ts` runs `web:build` but never `tsc`.
- **Fix.** Type the template's value so it checks. Make the web scaffold test run `tsc --noEmit` and `npm run check`.

### RB-03: read-only helpers can't use other extensions' reads
**Medium · chat, code · Decision: yes (changes ADR 0056)**
- **What happens.** `turns/read-only.ts` allows only kvcoder's built-in reads and `help`. Every registered connector command is refused, including kvbuilder's `docs get` and `kvman extensions-get`, which are queries. MCP calls are refused too.
- **Effect.** The architect said its design came "from your supplied facts, not independently inspected package documentation". The reviewer was also refused a browser call.
- **Option.** Allow a registered connector command whose target is a query.

### RB-04: the preview has no AI model
**Medium · chat · Decision: yes**
- **What happens.** The preview runs on its own temporary home, with no providers or keys.
- **Effect.** The product's main use, chatting with the assistant and its three research helpers, was never tried. The agent tested through direct command calls and the pages.
- **Constraint.** Copying keys into the preview home would break the secrets rule (CLAUDE.md §6), so this needs a design.

### RB-05: a chat link from another workspace shows three identical error toasts
**Medium · UI · Decision: yes (what the page should do)**
- **What happens.** Opening `/kvcoder/session/<id>` while the tab's workspace is a different one shows "This chat doesn't exist in this workspace." three times and an empty conversation.
- **Expected.** One message at most, and either the right workspace or this workspace's newest chat. The plan covers a workspace change on an open chat (ADR 0016) but not a link into another workspace.

### RB-06: the start screen's approval note is developer jargon and takes over the phone screen
**Medium · UI · Decision: no (wording), yes (hiding it, see RB-15)**
- **What happens.** The new-chat screen shows: "Auto mode is the default, but this is your loaded effective mode. For shell or binary execution, file writes or edits, and MCP tool calls, the model supplies the risky flag: risky:false may run without approval…". The Arabic version shows `risky:false` raw. At 390 px it fills the screen.
- **Fix.** Plain, short wording, with the details behind "Change it".

### RB-07: on a phone, the send box is pushed below the fold on the start screen
**Medium · UI · Decision: no**
- **What happens.** At 390 × 844, with the approval note, the page itself scrolls and the send box is only half visible. §8.7 keeps the send box always in view.

### RB-08: the Home workspace shows as the folder name
**Low · UI · Decision: no**
- **What happens.** The header says "Home", but kvcoder's start heading says "What should we build in ahmed?" and the research pages say "Workspace: ahmed".
- **Fix.** kvcoder uses the same translated name for Home as kvwebui. Note in the docs which name to show.

### RB-09: the execution map doesn't state its limits
**Low · chat · Decision: no**
- **What happens.** Three calls failed `VALIDATION_FAILED`: the goal is at most 300 characters, and a description or evidence at most 500. The error repeats the payload's shape but not its limits.
- **Fix.** Put the limits in the commands' help and in the error.

### RB-10: running a query through `preview command-run` says it doesn't exist
**Low · chat · Decision: no**
- **What happens.** The message is "There is no command research.evidence.search", but it exists as a query.
- **Fix.** Say it is a query and name `query-get`.

### RB-11: the preview's Settings page shows port 3737 while it runs on 3738
**Low · UI · Decision: no**
- The flag `--port` wins, but the page shows the setting's value with no hint.

## 2. Gaps for building a non-coding product on kvcoder

What already works for extensions: connectors (`asks`, `optIn`, binaries), sections, slash commands, session points, the sessions API, the conversation and session-list components, the settings for helpers and disabled connectors, and `runConnector` for tests. The gaps below are about reshaping the product, not adding to it.

### RB-12: the agent's identity and working method are fixed
**High · code · Decision: yes**
- **What happens.** The main prompt always starts "You are kvman Coder, the lead engineer… a software engineer", followed by the engineering method: execution maps, architects and testers, "ready for production", and a Commands section in `AGENTS.md`. Sections only add text after it, so the research assistant got two identities.

### RB-13: the chat's wording is fixed to coding
**High · UI, code · Decision: yes**
- **What happens.** "What should we build in {workspace}?" (`kvcoder.ui.startHeading`) and "Describe a change, a bug, or an idea…" appear in the research app.

### RB-14: one agent setup per app
**High · code · Decision: yes**
- **What happens.** Sections, helpers, and disabled connectors apply to every chat. A research chat and a coding chat can't live side by side, and research's `global: true` section would change every coding chat if it were installed into the `coder` preset.

### RB-15: developer screens can't be hidden from the end user
**Medium · UI · Decision: yes**
- **What happens.** The student's app shows Settings (port, worker threads, jobs per worker, the web app extension), Extensions, Models, kvcoder's configuration (shell path, MCP servers, program helpers such as opencode and Claude Code), and token counts in the status bar. A preset can't hide any of these.

### RB-16: no custom result cards
**Medium · code · Decision: yes**
- **What happens.** An extension's connector results show as the generic call card. Only kvcoder's own question card is a component inside the chat, so citations can't be clickable source cards.

### RB-17: extensions can't write artifacts
**Low · code · Decision: yes**
- **What happens.** `kvcoder.artifact.write` is private to the agent's connector, so an extension can't open a draft in the artifact panel.

### RB-18: there is no supported way to ship a preset to desktop users
**High · plan · Decision: yes**
- **What happens.** The desktop app starts kvman with no flags, so it always runs the default preset `coder` (plan 14 §14.3, step 3). The only workaround is a `coder.json` in `~/.kvman/presets/`, which a non-technical person can't place.
- **Options.**
  - A branded installer per preset, with its own name and the preset as default (recommended).
  - "Open a preset from a file or link" on the desktop home screen.

## 3. The builder's choices (fixed through the guide)

### RB-19: it nearly rebuilt what kvcoder already has
**Medium · chat · Decision: no**
- **What happens.** It agreed to build easy/medium/complex model profiles, and the owner had to point out that kvcoder's helpers already have their own model and thinking level.
- **Guide.** A different model for each kind of task means kvcoder helpers.

### RB-20: its first design made Library the main screen
**Medium · chat · Decision: no**
- **What happens.** The request said "chat … on top of kvcoder", but the designer's brief let it make a "library companion", and the lead showed it unchanged. The owner corrected it (#75).
- **Guide.** Check the design against the request's own words before showing it.

### RB-21: it depends on Python libraries found only on this machine
**High · chat, code · Decision: no**
- **What happens.** `document.py` imports PyMuPDF (`fitz`), pypdf, python-docx, and Pillow, which were checked only on this machine. A typical student's machine has none of them, the desktop app ships only Node and npm, and `npm:` installs run with `--ignore-scripts`.
- **Guide.** Ask where the app will run before choosing a system dependency, and prefer npm-only packages.
- **For this app.** Replace the Python helper with JavaScript libraries (for example pdf.js and mammoth; tesseract.js is already JavaScript).

### RB-22: students get developer tools
**Medium · code · Decision: no**
- **What happens.** `research-app` leaves `shell`, `fs`, and `mcp` on.
- **Guide.** For an app non-developers use, turn developer connectors off with `kvcoder.connectors.disabled`.

### RB-23: build-conversation text leaked into the product's screens
**Medium · UI · Decision: no**
- **What happens.** Library and Drafts say:
  - "To adjust research delegation, use the existing subagent settings. No separate research model profile is needed." (the owner's design decision, addressed to the student);
  - "Optional research management";
  - "save it via the research connector";
  - "All words must occur after normalization in the same passage (AND)".
- **Why checks missed it.** The browser checks tested behaviour, not wording.
- **Guide.** Every text on a screen speaks to the end user in their words. Read the screens' text as that user before calling the UI done.

### RB-24: Library and Drafts are heavy and repeat themselves
**Medium · UI · Decision: no**
- **What happens.**
  - Both pages open with the same three-paragraph introduction. At phone width the whole first screen is that text.
  - Each page repeats the side navigation as its own Library and Drafts tabs, has an "Open research chat" button next to the sidebar's Chat, and has a manual Reload button.
  - The two pages have different widths.

### RB-25: a recovery job every minute, forever, in every workspace
**Medium · code · Decision: no**
- **What happens.** `repository.ts:160` schedules `research.ingestion.recover` with the cron `* * * * *` and never cancels it, even when nothing is being indexed. That is about 10,000 jobs a week per workspace that ever imported a source.
- **Fix.** Schedule it only while sources are processing, and cancel it when none are.

### RB-26: helper briefs pointed at the wrong folder
**Low · chat · Decision: no**
- **What happens.** The project is in `research/`, but helpers looked for `AGENTS.md` and `docs/*.md` at the workspace root: five `NOT_FOUND`s.
- **Guide.** A brief names the project folder.

### RB-27: no Git repository
**Low · chat · Decision: yes (whether the scaffold starts one)**
- **What happens.** Helpers' `git diff` checks failed, and the owner has no history to go back to.

### RB-28: scaffold leftovers and an unpublishable name
**Low · code · Decision: no**
- **What happens.** Three `research.hello.*` and `pages.hello` keys remain after `Hello.vue` was removed. The package is named `research`, which can't be published to npm as is.

## 4. Improvements

1. **An agent profile, chosen by the preset.** It covers RB-12 to RB-15: the agent's identity and whether the engineering method applies, the start heading and the send box's placeholder, its connectors, helpers and slash commands, and whether developer screens show. To decide: a single profile per app (a few preset-only settings), or a profile chosen per chat (bigger; it also solves RB-14).
2. **Extension-owned result cards and artifacts** (RB-16, RB-17): public APIs, each its own decision.
3. **Builder guide additions** (no decision):
   - helpers for different models (RB-19);
   - check designs against the request (RB-20);
   - ask where the app runs and prefer npm-only dependencies (RB-21);
   - turn off developer connectors for non-developer apps (RB-22);
   - screen text speaks to the end user (RB-23);
   - schedules only while needed (RB-25);
   - name the project folder in briefs (RB-26);
   - a scoped package name before publishing (RB-28).
4. **Shipping to desktop users** (RB-18 and RB-21):
   - remove the Python dependency;
   - publish the extension under a scoped name;
   - use `npm:<version>` in the preset;
   - turn off developer connectors and set `kvai.defaultModel`;
   - choose how the desktop app gets the preset.

   On first start each person still adds an AI key on the Models page and accepts the trust dialog once.

## 5. Decisions to ask, in one round

RB-01, RB-03, RB-04, RB-05, RB-12 to RB-18 (as the agent profile, cards, artifacts, and shipping), and RB-27.

## 6. Order of work

1. **No decision needed:** RB-02, RB-06 (wording), RB-07, RB-08, RB-09, RB-10, RB-11, and the builder guide additions.
2. **After the decision round:** RB-01 first, since it blocks every kvcoder-based build. Then the agent profile and shipping.
3. **The research extension itself** (RB-21, RB-23 to RB-25, RB-28): the owner's project, changed through `/build-kvman` once kvman is fixed. That also gives a live trial of the fixes.

## Correction

During the review I first said the chat cost about $8.30 by adding the helpers' $2.30 to the header's $6.00. The $6.00 already includes them.
