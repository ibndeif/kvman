# QA 28 — a connector's own configuration: the cog and the shell's dialog (ADR 0020, 2 and 13)

Asked: "add a cog icon next to each connector to open a modal for this specific connector's configs". Decided in ADR 0020, 2 and 13; plan 08 §8.7. This file is the contract; every scenario's test name starts with its id.

## Happy path

- **QA28-H1 Only a connector with something to set has a cog.** *Given* the connectors list, *then* `shell`'s row has a cog button labelled "Configure shell" before its switch, and `fs`, `artifact`, `background`, `ask`, `subagent`, and the added connectors have none. `extensions/kvcoder/test/web/connectors-list.test.ts`
- **QA28-H2 The cog opens the connector's dialog.** *When* the person presses `shell`'s cog, *then* a dialog (`role="dialog"`, `aria-modal="true"`) shows, titled "shell", saying "Changes apply to all workspaces", with the rows "Shell approval" and "Shell program". `extensions/kvcoder/test/web/connector-dialog.test.ts`
- **QA28-H3 A choice saves as it changes.** *Given* the dialog, *when* the person picks "Ask for every call", *then* `kernel.settings.set { key: 'kvcoder.shell.approval', value: 'ask', scope: 'global' }` runs, the row says "Saved", and shows "Changed" with "Reset". `extensions/kvcoder/test/web/shell-settings.test.ts`
- **QA28-H4 The shell program saves on Enter and on leaving the field.** *When* the person types `/bin/zsh` and presses Enter, *then* the setting is set to `/bin/zsh`; *when* the person empties the field and leaves it, *then* it is set to `null`. A field left unchanged writes nothing. `extensions/kvcoder/test/web/shell-settings.test.ts`
- **QA28-H5 The dialog saves into the page's scope.** *Given* the page on "Only notes-app", *then* the dialog says "Changes apply to notes-app only", a change is written with `scope: 'workspace'`, the row shows "Changed for notes-app", and "Use the value for all workspaces" resets it. `extensions/kvcoder/test/web/shell-settings.test.ts`
- **QA28-H6 The dialog closes three ways, and focus returns to the cog.** *Then* Escape, a press on the backdrop, and the Close button each close it, a press inside it doesn't, focus is inside the dialog while it is open, and the cog has the focus after it closes. `extensions/kvcoder/test/web/connector-dialog.test.ts`
- **QA28-H7 The configuration is three cards.** *Then* `kvcoder.ui.get` gives Agent, Chats, and Connectors, with no Shell card and no `setting` view for `kvcoder.shell.approval` or `kvcoder.shell.path`. `extensions/kvcoder/test/ui.test.ts`
- **QA28-H8 In the real app.** *Given* kvman in Chromium on Coder's page, *when* the person presses `shell`'s cog and picks "Ask for every call", *then* the stored `kvcoder.shell.approval` is `ask`; after Escape the dialog is gone and the cog has the focus; after a reload the dialog shows "Ask for every call". `extensions/kvcoder/test/e2e/configuration.test.ts`

## Edge cases

- **QA28-E1 A workspace's own value can't be edited from All workspaces.** *Given* `kvcoder.shell.approval` set for the workspace and the page on "All workspaces", *then* the select is disabled and shows the workspace's value, and a line says "notes-app has its own value. Switch to notes-app to change it." `extensions/kvcoder/test/web/shell-settings.test.ts`
- **QA28-E2 A change that fails.** *Given* `kernel.settings.set` fails `VALIDATION_FAILED`, *then* the Problem is toasted, the row doesn't say "Saved", and the field shows the stored value again. `extensions/kvcoder/test/web/shell-settings.test.ts`
- **QA28-E3 The cog works while the connectors list is locked.** *Given* a workspace with its own disabled list and the page on "All workspaces", *then* the switches are disabled and the cog still opens the dialog. `extensions/kvcoder/test/web/connectors-list.test.ts`
- **QA28-E4 Tab stays in the dialog.** *Given* the dialog, *when* the person presses Tab on its last control, *then* focus moves to its first; Shift+Tab on the first moves to the last. `extensions/kvcoder/test/web/connector-dialog.test.ts`
- **QA28-E5 Right to left.** *Given* Arabic, *then* the cog's label and the dialog's texts are Arabic, and the shell program's field stays left to right. `extensions/kvcoder/test/web/shell-settings.test.ts`
