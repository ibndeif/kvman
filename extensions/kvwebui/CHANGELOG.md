# @kvman/kvwebui

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
