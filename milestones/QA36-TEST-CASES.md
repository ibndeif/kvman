# QA 36 — restarting kvman, and undoing a change that stops it from starting (ADR 0024)

Asked: "Add a restart command (an approval-gated one)" so that a person who isn't a developer needn't know how to restart kvman. Decided in ADR 0024; plan 01 §1.2, plan 02 §2.10, §2.12, and §2.14, plan 06 §6.6, and plan 09 §9.1 and §9.4. This file is the contract; every scenario's test name starts with its id. Kernel and kvcustomizer tests run a test kernel; CLI tests run a real kvman child process from source; the web tests mount the app on a fake API.

A turn whose step asked for the restart ends `interrupted` through kvcoder's existing interruption of a step cut off by a stop (M2.4-E, plan 08 §8.1), so it has no scenario of its own. It retires the line "you can't restart it yourself" in QA34-H12 and QA35-H8, which now say the agent restarts it.

## Happy path

- **QA36-H1 `kernel.restart` asks the run to restart.** *Then* `kernel.restart {}` answers `{ restarting: true }`, `Kernel.restartRequested` resolves, and the command is in `kernel.registrations.list` as a public command of the kernel. `packages/kernel/test/restart/restart-request.test.ts`
- **QA36-H2 `health` has `rolledBack` only after an undone start.** *Given* the start option `rolledBack`, *then* `kernel.health.get` answers it as `{ code, message, params? }`; without it the field is absent. `packages/kernel/test/restart/restart-request.test.ts`
- **QA36-H3 The first edit keeps a backup.** *Given* a home preset, *when* `kernel.extensions.install` runs, *then* `<home>/presets/<name>.json.good` holds the preset as it was running; a second edit leaves it as it was; `uninstall` makes it the same way. `packages/kernel/test/preset-edit/backup.test.ts`
- **QA36-H4 The first edit of the bundled preset backs up the bundled one.** *Then* the home copy has the edit and `.good` has the bundled preset. `packages/kernel/test/preset-edit/backup.test.ts`
- **QA36-H5 A file preset's backup is beside the file.** *Given* `--preset ./app.json`, *then* the backup is `./app.json.good`. `packages/kernel/test/preset-edit/backup.test.ts`
- **QA36-H6 A restart applies an edit.** *Given* a running kvman child with `--yes`, *when* a project is installed with `kernel.extensions.install` and `kernel.restart` is called, *then* kvman prints `kvman is restarting…` and then `kvman is running at <url>` again, its lock has the same pid and the new port, and `kernel.extensions.list` has the project. `packages/cli/test/restart/restart.test.ts`
- **QA36-H17 The browser opens once.** *Given* a run with the browser on, *when* kvman restarts, *then* the browser was opened for the first start and not for the second. `packages/cli/test/restart/browser.test.ts`
- **QA36-H7 A good start deletes the backup.** *Then* after that restart `<file>.good` is gone. `packages/cli/test/restart/restart.test.ts`
- **QA36-H8 A start that fails because of the preset is undone.** *Given* an installed `path:` project whose manifest is invalid, *when* kvman restarts, *then* it prints the Problem (`EXTENSION_INVALID`) and `The last change to the preset was undone.`, runs again with the extensions it had, the preset file is as it was, `.good` is gone, and `kernel.health.get` has `rolledBack` with that code and message. `packages/cli/test/restart/rollback.test.ts`
- **QA36-H9 Only that start has `rolledBack`.** *Then* after another restart `kernel.health.get` has no `rolledBack`. `packages/cli/test/restart/rollback.test.ts`
- **QA36-H10 Workspaces and Home stay.** *Given* a second open workspace, *then* it is in `kernel.workspace.list` after the restart with the same id. `packages/cli/test/restart/restart.test.ts`
- **QA36-H11 `kvman restart` is a command that asks.** *Then* the `kvman` connector's command `restart` runs `kvcustomizer.app.restart`, has `asks: true`, follows `extensions-uninstall`, and the six commands that ask are `model-set`, `settings-set`, `settings-reset`, `extensions-install`, `extensions-uninstall`, and `restart`. `extensions/kvcustomizer/test/registration.test.ts`
- **QA36-H12 It runs `kernel.restart`.** *Then* `kvcustomizer.app.restart` answers `{ restarting: true }` and `Kernel.restartRequested` resolves; it is a public command. `extensions/kvcustomizer/test/restart.test.ts`
- **QA36-H13 A turn that calls it waits for the person.** *Given* a scripted model that calls `kvman restart`, *then* the session is `waiting` on an approval, and nothing restarted until it is allowed. `extensions/kvcustomizer/test/restart.test.ts`
- **QA36-H14 The guide says to restart.** *Then* `init`'s text says to make one `kvman restart` call whose `description` says what stops, that the terminal may ask the person to trust the extension, that the page may need a reload, and to read `health-get` afterwards and say, when `rolledBack` is set, that the change was undone and why; "you can't restart it yourself" is gone. `extensions/kvcustomizer/test/init.test.ts`
- **QA36-H15 "Restart now".** *Given* pending changes, *then* the banner has "Restart now"; it asks "Restart kvman? What is running stops." and calls nothing; "Restart" calls `kernel.restart`, shows "Restarting…", and when `kernel.health.get` fails and then answers, the page reloads. `extensions/kvwebui/test/web/restart-now.test.ts`
- **QA36-H16 The page says a change was undone.** *Given* a health answer with `rolledBack`, *then* a banner shows "The last change was undone because kvman couldn't start with it" and the Problem's message, in English and in Arabic. `extensions/kvwebui/test/web/restart-now.test.ts`

## Edge cases

- **QA36-E1 Several requests make one restart.** *Then* two `kernel.restart` calls before the stop begins answer `{ restarting: true }` both times and kvman restarts once. `packages/cli/test/restart/restart.test.ts`
- **QA36-E2 A failure that isn't the preset's is not undone.** *Given* a backup and a port that is taken, *then* the start fails `PORT_IN_USE`, kvman exits 1, and the preset file and `.good` are untouched. `packages/cli/test/restart/rollback.test.ts`
- **QA36-E3 No backup, no undo.** *Given* a preset that fails to load and no `.good`, *then* kvman exits 1 with the Problem, as before. `packages/cli/test/restart/rollback.test.ts`
- **QA36-E4 A restored preset that fails too.** *Then* kvman exits 1 with the second Problem, doesn't try again, and the backup has been used. `packages/cli/test/restart/rollback.test.ts`
- **QA36-E5 `VALIDATION_FAILED` is undone too.** *Given* an edit that adds a setting the extensions don't register, *then* the start is undone as in H8. `packages/cli/test/restart/rollback.test.ts`
- **QA36-E6 A refused trust is undone.** *Given* an installed extension and no terminal and no `--yes`, *then* a plain start of kvman (not a restart) refuses it, restores the preset, and runs. `packages/cli/test/restart/rollback.test.ts`
- **QA36-E7 Ctrl+C after a restart.** *Then* SIGINT stops kvman with exit code 0, and `kvman.lock` is gone. `packages/cli/test/restart/restart.test.ts`
- **QA36-E8 A restart stops processes.** *Given* a process an extension started with `ctx.processes`, *then* it is not running after the restart until its extension starts it again. `packages/cli/test/restart/restart.test.ts`
- **QA36-E9 A foreign origin can't restart kvman.** *Then* `POST /api/commands/kernel.restart` with another Origin fails `FORBIDDEN_ORIGIN` and nothing restarts. `packages/cli/test/restart/restart.test.ts`
- **QA36-E10 Cancel does nothing.** *Then* "Cancel" in the page's confirmation calls no command, and the button is back. `extensions/kvwebui/test/web/restart-now.test.ts`
- **QA36-E11 A failed call shows its Problem.** *Given* `kernel.restart` fails, *then* the page shows the Problem and doesn't poll. `extensions/kvwebui/test/web/restart-now.test.ts`
- **QA36-E12 A restart that is never seen down.** *Given* `kernel.health.get` answers with a smaller uptime than before and never failed, *then* the page reloads. `extensions/kvwebui/test/web/restart-now.test.ts`
- **QA36-E13 No banner without a change.** *Then* with nothing pending the page has no "Restart now". `extensions/kvwebui/test/web/restart-now.test.ts`
- **QA36-E15 `help` says the person is asked.** *Then* `help { command: 'restart' }` has the line "The person is asked before this runs.". `extensions/kvcustomizer/test/restart.test.ts`
- **QA36-E14 The texts have `en` and `ar`.** *Then* every new key of kvwebui is in both catalogs. `extensions/kvwebui/test/locales.test.ts`
