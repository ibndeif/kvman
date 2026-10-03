# QA 13 — choosing a folder (ADR 0009, 219–220)

Asked: "Open a folder…" was a box for a typed path, with no dialog to pick a folder. A browser can't hand kvman an absolute path, so the product owner chose a folder browser in the page, fed by a new kernel query. Every scenario names its test. Kernel tests use the testkit's kernel and a temporary folder tree; `test/web/` mounts the app in happy-dom against a fake API; `test/e2e/` drives Chromium against a real kvman.

## Happy path

- **QA13-H1 The query lists the sub-folders of a folder.** *Given* a folder `root` holding the folders `b`, `a`, `.hidden`, and the files `f.txt` and `g.md`, *then* `kernel.folder.list { path: root }` answers `{ path: <real root>, parent: <dirname>, folders: [{ name: 'a', path }, { name: 'b', path }], truncated: false }`, with no file and no `.hidden`. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-H2 Hidden folders come back on request.** *Given* `hidden: true`, *then* `.hidden` is listed, in name order with the others. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-H3 With no path it starts at Home's folder.** *Then* `kernel.folder.list {}` answers Home's folder as `path`. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-H4 The dialog browses and opens a folder.** *Given* the fake API's folder tree, *when* "Open a folder…" is chosen, *then* the dialog shows the start folder's path and its sub-folders; a click on a folder lists it; Up goes to the parent; "Open this folder" runs `kernel.workspace.open { path }` with the folder shown, closes the dialog, and the tab moves to that workspace. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-H5 A typed path goes there.** *When* a path is typed and Enter is pressed, *then* the dialog lists that folder. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-H6 Show hidden asks for hidden folders.** *When* the switch is turned on, *then* the current folder is listed again with `hidden: true`. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-H7 In a real browser the dialog opens a workspace.** *Given* a real kvman and a temporary tree, *then* the person enters folders by clicking, opens one, and the picker shows it as the current workspace with its folder. (`extensions/kvwebui/test/e2e/folder-browser.test.ts`)

## Edge cases

- **QA13-E1 A bad path fails `VALIDATION_FAILED`.** *Given* a relative path, a path that doesn't exist, and a file, *then* each fails `VALIDATION_FAILED` and names the reason. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-E2 The root has no parent.** *Given* `/` (or the drive root), *then* `parent` is `null`. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-E3 A symlink to a folder is a folder, a symlink to a file is not.** (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-E4 The list is capped at 1 000 folders.** *Given* 1 001 sub-folders, *then* 1 000 come back, the first by name, and `truncated` is `true`; with exactly 1 000, `truncated` is `false`. (`packages/testkit/test/folders/folder-list.test.ts`)
- **QA13-E5 A folder that can't be read says so and the dialog stays.** *Given* the query fails `VALIDATION_FAILED`, *then* the dialog shows the reason, keeps the folder it was on, and "Open this folder" still opens that folder. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-E6 Up is off at the root, and an empty folder says it is empty.** (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-E7 The dialog starts where the person is.** *Given* the open workspace is a folder other than Home, *then* the first listing is that folder; in Home, Home's folder. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-E8 A truncated list says so.** *Given* `truncated: true`, *then* a line says the list was cut. (`extensions/kvwebui/test/web/folder-browser.test.ts`)
- **QA13-E9 Every new text is in both languages.** *Then* `en` and `ar` have the same keys, including the new ones. (`extensions/kvwebui/test/locales.test.ts`)
- **QA13-E10 The query is public, read-only, and unknown keys fail.** *Then* `kernel.extensions.list` shows `kernel.folder.list` as a query, and a call with an unknown key fails `VALIDATION_FAILED`. (`packages/testkit/test/folders/folder-list.test.ts`)
