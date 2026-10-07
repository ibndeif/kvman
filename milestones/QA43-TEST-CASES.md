# QA 43 — `kvman uninstall` (ADR 0031)

Asked: "I want to add uninstall to kvman so the user can write 'kvman uninstall'".

The tests give the command a fake terminal, a fake `npm`, a temporary home, and a fake clock where it waits; none runs the real `npm` or touches the real `~/.kvman`.

## Happy path

- **QA43-H1 `uninstall` is parsed.** *Then* `kvman uninstall` parses to `{ kind: 'uninstall', home: undefined, yes: false, data: 'ask' }`; `--home /h --yes --delete-data` gives `home: '/h'`, `yes: true`, `data: 'delete'`; and `--keep-data` gives `data: 'keep'`. `packages/cli/test/arguments.test.ts`
- **QA43-H2 Yes, then no: the program goes and the data stays.** *Given* a terminal that answers `y` then `n`, a home with data, no kvman running, and kvman installed with npm's global install, *when* `kvman uninstall` runs, *then* it prints `This removes kvman from this computer.`, asks `Remove kvman? [y/N] `, prints the home folder and `(chats, provider keys, presets).`, asks `Delete it too? [y/N] `, runs `npm uninstall -g kvman` once, leaves the home folder whole, prints `kvman was removed. Your data was kept in <home>`, and exits 0. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-H3 Yes, then yes: the data goes too.** *Then* npm runs, the home folder is gone afterwards, the last line is `kvman and its data were removed.`, and it exits 0. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-H4 npm runs before the data is deleted.** *Then*, with both answers `y`, the home folder still exists while npm runs. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-H5 The flags answer the questions.** *Then* `--yes --delete-data` asks nothing and removes both; `--yes --keep-data` and `--yes` alone ask nothing and keep the data; `--delete-data` alone asks only the first question. `packages/cli/test/uninstall/flags.test.ts`
- **QA43-H6 A running kvman is stopped first.** *Given* the home's lock names a live process, *when* the person answers `y`, *then* the first message has the line `kvman is running and will be stopped.`, the process is asked to stop before npm runs, and npm runs only once it is gone. `packages/cli/test/uninstall/stop-running.test.ts`
- **QA43-H7 The stop is the platform's.** *Then* on Linux and on macOS the process gets SIGTERM, and on Windows `taskkill /PID <pid> /T /F` runs. `packages/cli/test/uninstall/stop-running.test.ts`
- **QA43-H8 `--home` names the home.** *Then* with `--home <dir>` the second message names `<dir>`, and that folder is the one deleted. `packages/cli/test/uninstall/flags.test.ts`
- **QA43-H9 The help has it.** *Then* `kvman --help` has the line `kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]` and a line for each of the two flags. `packages/cli/test/arguments.test.ts`
- **QA43-H10 The install page says how to remove kvman.** *Then* `docs/user-guide/installing.md` has `kvman uninstall`, says the two questions, and no longer says that there is no subcommand. `packages/cli/test/docs.test.ts`
- **QA43-H11 The real program stops a real kvman and keeps its data.** *Given* a kvman child running on a temporary home, and a fake `npm` first on the PATH whose `root -g` answers the folder that holds this kvman, *when* `kvman uninstall --home <home> --yes` runs as a child, *then* the running kvman exits, the fake npm was called with `uninstall -g kvman`, the home folder is whole, and the child exits 0. `packages/cli/test/uninstall/uninstall-child.test.ts`
- **QA43-H12 A program starts the platform's way.** *Then* on Linux and on macOS `npm` starts directly, and on Windows through a shell, since `npm` is `npm.cmd` there; a captured run prints nothing, a shown one prints the program's output, and a program that can't start answers that it didn't. `packages/cli/test/uninstall/run-program.test.ts`

## Edge cases

- **QA43-E1 No to the first question removes nothing.** *Then* an answer of `n`, an empty line, `yes`, and the end of input each print `Nothing was removed.`, run no npm, ask no second question, stop no kvman, and exit 0. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-E2 Only `y` deletes the data.** *Then* a second answer of `yes`, an empty line, and the end of input each keep the home folder. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-E3 `--keep-data` with `--delete-data` is refused.** *Then* it fails `VALIDATION_FAILED` and exits 1 before any question. `packages/cli/test/arguments.test.ts`
- **QA43-E4 Other words and flags are refused.** *Then* `kvman remove`, `kvman uninstall extra`, `kvman uninstall --port 1`, and `kvman --keep-data` each fail `VALIDATION_FAILED`. `packages/cli/test/arguments.test.ts`
- **QA43-E5 With no terminal, a question no flag answers stops the command.** *Then* `kvman uninstall` with no terminal removes nothing, names `--yes`, and exits 1; `kvman uninstall --yes` with no terminal keeps the data and removes the program, since `--yes` alone keeps it. `packages/cli/test/uninstall/flags.test.ts`
- **QA43-E6 A kvman that npm didn't install globally isn't removed.** *Given* `npm root -g` answers another folder, *then* after the questions the command says this kvman wasn't installed with `npm i -g kvman`, stops no kvman, runs no `npm uninstall`, keeps the data even after two `y`, and exits 1. `packages/cli/test/uninstall/installed-check.test.ts`
- **QA43-E7 A symlinked global folder still matches.** *Given* npm's global folder reached through a symbolic link, *then* the check passes. `packages/cli/test/uninstall/installed-check.test.ts`
- **QA43-E8 No npm on the PATH.** *Then* the command says npm wasn't found, removes nothing, and exits 1. `packages/cli/test/uninstall/installed-check.test.ts`
- **QA43-E9 A kvman that doesn't stop fails the command.** *Given* a process still alive 15 seconds after it was asked to stop, *then* the command says kvman didn't stop, runs no npm, keeps the data, and exits 1. `packages/cli/test/uninstall/stop-running.test.ts`
- **QA43-E10 A lock whose process is gone stops nothing.** *Then* the first message has no line about a running kvman, and nothing is asked to stop. `packages/cli/test/uninstall/stop-running.test.ts`
- **QA43-E11 npm fails.** *Given* `npm uninstall -g kvman` exits 1, *then* the command prints that it failed and the line `npm uninstall -g kvman`, keeps the data even when its deletion was agreed, and exits 1. `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-E12 A home folder that isn't there.** *Then* with both answers `y` the command succeeds and prints `kvman and its data were removed.` `packages/cli/test/uninstall/uninstall.test.ts`
- **QA43-E13 Only the home is deleted.** *Given* a workspace folder and a preset file outside the home, *then* both are whole after a full uninstall. `packages/cli/test/uninstall/uninstall.test.ts`
