# Preview and hot reload

This page is for anyone developing an extension. When you finish, you can see your extension running in a separate kvman without touching your real data, understand exactly what reloads when you save a file, and know what happens when a reload fails.

## `kvman-preview`

```sh
kvman-preview ./notes                                     # one or more extension project folders
kvman-preview ./notes ./cards --preset ./app.json         # build on a preset of your own
kvman-preview ./notes --kvman ./node_modules/kvman/dist/main.js --name notes --json
```

| Flag | Meaning |
|---|---|
| `<folder>…` | One or more projects (each must have a `package.json` with a `kvman` field; otherwise `VALIDATION_FAILED`). |
| `--preset <file>` | A preset the preview builds on: its extensions, with its `path:` entries made absolute and your folders added over entries of the same name, keeping its settings. |
| `--kvman <entry>` | The kvman entry file to run (with the Node and flags of the bin). Without it, the `kvman` found on the PATH. |
| `--name <name>` | Names the preview's home, `<os temp>/kvman-preview-<name>` (default `preview`). |
| `--json` | Prints `{ "url": … }` as one line when the preview is ready, and failures as one JSON object on stderr. |

What it does, in order:

1. **A fresh home.** `<os temp>/kvman-preview-<name>`, emptied at each start, so a preview never touches real data. If a preview with that name still runs, it fails `PREVIEW_FAILED` (use `--name`).
2. **A port.** The first free port from 3738 to 3837 on `127.0.0.1`; none free fails `NO_FREE_PORT`.
3. **A generated preset** in the preview's home: kvai and kvwebui as `bundled`, each folder's package name as `path:<absolute folder>`, and `kvwebui.home` set to `kvwebui.extensions` (or your `--preset`, with your folders added).
4. **`web:watch`.** For each project whose `package.json` has a `web:watch` script, it runs `npm run web:build` once (a failure is `PREVIEW_FAILED` with npm's last lines), then keeps `npm run web:watch` running so component edits rebuild.
5. **The preview kvman**, started with `--home <home> --port <port> --yes --no-open --preset <generated>`.
6. **Ready.** It polls the preview's `kernel.health.get` every 200 ms for up to 30 s. If the preview exits first, or 30 s pass, everything started is stopped and it fails `PREVIEW_FAILED` with the preview's last output lines. When ready it prints the URL (`Preview running at http://127.0.0.1:3738/`, or `{ "url": … }` with `--json`) and keeps running.

**Stopping.** Ctrl+C (SIGINT) or SIGTERM stops the preview kvman (SIGINT first, SIGKILL to its group after 10 s), then each `web:watch` tree, then removes the home, and exits 0. If the preview kvman exits by itself while running, the bin stops the watchers, removes the home, and exits 1 with `PREVIEW_FAILED`. On Windows there are no signals to send, so the trees are killed with `taskkill /T /F`.

Through the agent: `preview start`, `preview stop`, and `preview status` run this same bin under kvman's process service, with `--name` set to the workspace id. A preview also stops when the kvman that started it stops.

## Hot reload

A `path:` extension's folder is watched (recursively, ignoring `node_modules`). Events are batched until 200 ms pass without one. On a change, the kernel starts fresh workers that load every extension with the new code. The old workers take no new jobs and exit when their running jobs end, so running jobs finish on the old code. (ES modules can't be unloaded, so a worker never reloads in place.)

- A reload that **fails** keeps the previous code and workers and logs the error. It fails when the reloaded extension's own manifest breaks a start rule (its namespace, its SDK range, its own dependencies) or its entry fails to load. Each reload logs `extension reloaded` or `extension reload failed`.
- After a reload, the `kernel.started` handlers of the reloaded extension and of every extension that depends on it run again, in dependency order.
- A reload doesn't touch the extensions that depend on it. If the new version no longer satisfies a dependent's range, or drops a name a dependent calls, the reload still applies, a warning is logged, and those calls fail `NOT_FOUND`. The start-time checks apply again at the next start.
- Long-lived processes keep running through a reload.
- `source` (`src/index.ts`) is loaded directly with Node's type stripping (erasable TypeScript only), so there is **no build step** while you develop. A `bundled` or `npm:` extension doesn't reload.

For a component, a page refresh loads the new build: the component URL carries the extension's `revision`, which grows with each reload.

## Next

- [components.md](components.md)
- [testing.md](testing.md)
- [presets.md](presets.md)
