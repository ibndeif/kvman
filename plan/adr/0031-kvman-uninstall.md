# ADR 0031 — `kvman uninstall`

The product owner asked (2026-10-07): "I want to add uninstall to kvman so the user can write 'kvman uninstall'". Until now `kvman` had no subcommand (plan 01 §1.2), and removing kvman meant knowing that it is an npm package and that its data is a folder.

Decisions 1 to 3 were asked with alternatives and mockups. Decisions 4 to 12 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **`kvman uninstall` removes the program, and the data only when the person agrees** (chosen over removing everything after one question, and over never touching the data). It asks two questions: `Remove kvman? [y/N]`, then, naming the home folder, `Delete it too? [y/N]`. Only `y` agrees, as for the trust question (ADR 0009, 48).
2. **It removes the program by running `npm uninstall -g kvman`** (chosen over printing the command for the person to run).
3. **A kvman that runs on that home is stopped first** (chosen over refusing). The first message says that it is running and will be stopped.
4. **The command line.** `kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]`. This is the one subcommand; any other first word that isn't a flag fails `VALIDATION_FAILED` as before, and so does any other flag after `uninstall`.
   - `--home` names the home whose data and running kvman are meant, with the usual default (`KVMAN_HOME`, else `~/.kvman`).
   - `--yes` answers the first question with yes. It never answers the second.
   - `--keep-data` and `--delete-data` answer the second question; both together fail `VALIDATION_FAILED`. With `--yes` and neither, the data is kept.
   - With no terminal, a question that no flag answers can't be asked: the command removes nothing, says which flag answers it, and exits 1.
5. **Everything is asked and checked before anything changes.** In order: the questions; then the check that this kvman is npm's global one; then the stop; then npm; then the data.
6. **The check.** The command runs `npm root -g`. Unless the running program's own package folder is `<that folder>/kvman` (compared as real paths), it removes nothing, says that this kvman wasn't installed with `npm i -g kvman` and that the way it was installed removes it, and exits 1. The same happens when `npm` isn't on the PATH.
7. **The stop.** When the home's lock names a live process, that process is asked to stop and the command waits until it is gone, at most 15 seconds: SIGTERM on Linux and macOS, which runs the stop sequence (plan 02 §2.14), and `taskkill /PID <pid> /T /F` on Windows, where no signal reaches another process. A kvman that is still alive after that fails the command: nothing is removed, and it exits 1. Only that home's kvman is stopped.
8. **npm.** `npm uninstall -g kvman` runs with its output shown. When it fails, the command says so, gives the line to run by hand, leaves the data alone, and exits 1.
9. **The data** is deleted only after npm succeeded: the whole home folder, with its chats, provider keys, presets, installed extensions, and logs. A home folder that isn't there is not an error.
10. **What it prints.** English, as the CLI's other texts are. The first message is `This removes kvman from this computer.`, with `kvman is running and will be stopped.` after it when it is. The second names the home folder and says `(chats, provider keys, presets)`. The last line is `kvman was removed. Your data was kept in <home>` or `kvman and its data were removed.`; a `no` to the first question prints `Nothing was removed.` and exits 0.
11. **The usage text** (`--help`) gains the line and the two flags, and the user guide's install page says how to remove kvman.
12. **Nothing else is removed**: not the workspace folders, not a preset file outside the home, not another home.
