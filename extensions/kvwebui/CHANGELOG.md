# @kvman/kvwebui

## 0.1.6

### Patch Changes

- 1942677: Counts that read as words (ADR 0098). A catalog text may hold plural forms separated by `|`, one per plural category of its language (English two, Arabic six), and kvwebui chooses one by a numeric `count` param, in `kvman.t`, toasts, and contributed views and status items. kvman's own count texts use them: `1 file`, `Show 1 earlier message`, `1 provider`, `Allow this command?`, `1 turn`. A fold of calls reads as a sentence, `Read 3 files, changed 1 file, ran 1 command · 1 failed`, with each file counted once, `fs read-files` counted as a read, the failures in the danger color, and the words at the row's start. The testkit's i18n guide explains plural forms.
- Updated dependencies [1942677]
  - @kvman/sdk@0.1.4

## 0.1.5

### Patch Changes

- 0962c2d: A status item may set `titleCount`, a field of its query's output; the tab's title then starts with `(N) ` while the items' counts add up to more than 0 (ADR 0091, 7).

## 0.1.4

### Patch Changes

- 9e2439b: Products on kvcoder, and the fixes from the research build review (ADR 0082): `kvwebui.home` defaults to the Extensions page, so an extension that depends on kvcoder passes its checks; a preset hides developer screens (`kvwebui.nav.hidden` with the built-in pages, `kvwebui.status.hidden`, `kvwebui.workspacePicker`); `kvcoder.profile` gives the agent a product's identity, a short general method, and the Chat page's words; a connector command may show its own `card`; `kvcoder.artifact.write` and `.edit` are public; read-only helpers run other extensions' queries; a chat link from another workspace shows one notice; the new chat's approval note is one plain line and Home is called Home; the scaffold type-checks and starts a Git repository (`GIT_FAILED`); the preview's wrong-kind calls say which call to use; and the builder's guide teaches products for people who aren't developers.

## 0.1.3

### Patch Changes

- 90fb869: A workspace whose folder is gone is closed at start. `kernel.workspace.closed.list` lists the closed workspaces, `kernel.workspace.delete` erases one for good after stopping its work, and the new point `kernel.workspace.deleted` tells extensions, in Home. The workspace picker has a "Closed workspaces" section with Reopen, Delete, and "Delete all missing"; kvcoder forgets a deleted workspace's background-process records (ADR 0061).
- 0616ef9: A fenced `mermaid` block in Markdown is drawn as a diagram, wherever kvwebui shows Markdown. The `mermaid` package (12.1.0) is loaded only when a page shows such a block; it runs with `securityLevel: 'strict'` and no HTML labels, its SVG is sanitized, and a block that isn't a valid diagram stays as its source (ADR 0067).
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
  - @kvman/sdk@0.1.2

## 0.1.2

### Patch Changes

- f3eafb5: The light theme is soft slate: a blue-gray ground, off-white panels, and a slate-blue accent, with nothing pure white or pure black (ADR 0037, 3). The dark theme is unchanged.

## 0.1.1

### Patch Changes

- d1d1fe4: kvcustomizer is renamed to kvbuilder, shown as "kvman builder" (ADR 0027, 7): the package is `@kvman/kvbuilder`, its namespace `kvbuilder`, its commands and queries `kvbuilder.*`, and its errors `kvbuilder/*`. The `coder` preset lists it. A preset of your own that names `@kvman/kvcustomizer` must name `@kvman/kvbuilder` instead. The docs of the testkit, kvwebui, and kvcoder use the new name.

## 0.1.0

The first published version. What it holds, in the order it was built:

- kvwebui: the web app's frame (workspace picker, language and theme menus, a collapsible nav, panels, the status bar, toasts, and dialogs), pages from every extension's `ui.get`, the built-in view components, and the Settings and Extensions pages.
- kvwebui: custom components from extensions' `kvman.web` folders, sharing kvwebui's Vue through an import map, with their CSS, the extension's revision in their URLs, and an injected `kvman` (`exec`, `execAsync`, `stream`, `follow`, `navigate`, `toast`, `panel`, `t`, `workspace`, `View`); the `--kv-*` theme variables for light and dark; and effects (`kvwebui.effect.add`, `kvwebui.effect.take`, and an hourly `kvwebui.effect.clean`) applied when a job the UI started or follows ends.
- Below 768 px the nav is an icon rail that opens over the page, a horizontal stack takes the page's height, a rejected setting shows the first issue under its field, and Markdown tables have borders.
- `kvman.refresh()` reruns the page's queries and the status items, and the open-folder dialog shows why a folder was refused.
- The status bar starts with the workspace folder, and status items may format numbers (`format: 'compact' | 'usd'`), read a dotted `$output` path, and use the page's route params.
- Every enabled button, link, summary, select, and checkbox shows the hand cursor, which the CSS reset had taken from buttons.
- A cost in the status bar reads `0.0070 US$`, not `$US 0.0070`, in a right-to-left language.
- "Open a folder…" is a folder browser: it shows a folder's sub-folders, goes into one with a click or up one level, takes a typed path, shows hidden folders on request, and opens the folder shown as a workspace, instead of asking for a typed path alone.
- The folder browser is faster and easier to use: it shows a loading state, never lets an older answer replace a newer one, and shows folders it has seen at once; it has Places (Home and the open workspaces), clickable path segments, Back and Up, marks folders that are already workspaces, filters the list as you type, works from the keyboard (arrows, Enter, Backspace), and can make a new folder and open it. A path being typed is never replaced.
- The Extensions page manages extensions: an "Add an extension" form (a name and a source: `npm:<exact version>`, `path:<folder>`, or `bundled`) installs into the preset, each card has an inline-confirmed Remove, extensions the stored preset adds or drops show "Starts after restart" or "Removed after restart" under a "Restart kvman to apply" banner, and a failure shows its Problem. kvwebui also documents itself: `kvwebui.docs.list` and `kvwebui.docs.get` serve the pages `views` and `components`.
- The Settings page has one scope switch for the page, saves a setting as it changes, names choices from `<key>.options.<value>`, lists the installed languages, keeps each key in the row's details, and has a search box. Rendered Markdown blocks take their direction from their own text, and names on the Extensions page stay left to right. The Arabic catalog was reviewed.
- The Settings page holds only kvman's own settings. Each extension has its own page under Extensions (`/kvwebui/extension/<namespace>`) with the `configuration` view its `ui.get` gives, one switch for where changes are stored, and its secrets. A new view component, `setting { key }`, shows one of the extension's settings there, and custom components read the switch as `kvman.scope`. The Extensions page no longer lists commands, queries, or handlers (ADR 0014).
- kvwebui's own page shows its theme only: the nav order, the hidden nav items, the title, and the home page are settings a preset sets, and are no longer shown (ADR 0015).
- The Extensions page's banner "Restart kvman to apply" has a "Restart now" button: it asks once, calls `kernel.restart`, shows "Restarting…", and reloads the page when kvman answers again. When `kernel.health.get` has `rolledBack`, the page says that the last change was undone and shows the Problem (ADR 0024, 9).
- An extension is installed by its source alone (ADR 0025). `kernel.extensions.install` takes `{ source }`, where `source` is `bundled:<name>`, `npm:<name>@<exact version>`, or `path:<folder>`, whose name the kernel reads from the folder's package.json; `@kvman/sdk` gains `installSourceSchema` and `InstallSource`. The Extensions page's form has one field, the source, and kvcustomizer's `kvman extensions-install` takes `{ source }`.
