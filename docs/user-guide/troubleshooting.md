# Troubleshooting

This page is for anyone who sees an error or a start failure. When you finish, you can find the message you got, understand it in plain words, and fix it.

kvman shows a failure as a plain sentence. Under **Details** (in the app) or in the terminal you also see a **code** in capitals, such as `PORT_IN_USE`. Find the code below.

## kvman won't start

| What you see | What it means | What to do |
|---|---|---|
| `KVMAN_RUNNING` | Another kvman is already running on this home folder, with a different `--preset` or `--mode`, or it doesn't answer. | Run plain `kvman` to open your folder in the running one, or stop it (Ctrl+C in its terminal) and start again, or give the new one its own `--home`. |
| `PORT_IN_USE` | Port 3737 (or the one you chose) is taken by another program. | Use `--port 4000` (or `--port 0` for any free port), or stop the program that uses it. |
| `EXTENSION_INVALID` | An extension in your preset couldn't load: a broken manifest, a missing dependency, a name clash, an invalid registration, or a refused trust question. The message names the extension and the reason. | Fix or remove that extension (see [Extensions](extensions.md)). If you declined the trust question, start again and answer `y`, or use `--yes`. |
| `VALIDATION_FAILED` at start | Your preset, or a setting in it, is invalid: an unknown preset name, an unreadable file, an unknown key, a bad value, or a required setting with no value. | Read the message: it names the file or the key. Fix the preset (see [Presets](presets.md)). |
| `EXTENSION_INVALID` that mentions npm | Installing an `npm:` extension at start needs npm and your network, and the install failed. | Install Node.js with npm, check your network, and start again. |
| `EXTENSION_INVALID` and no terminal | An extension needs your trust, and kvman has no terminal to ask. | Start kvman from a terminal, or add `--yes`. |
| the browser doesn't open | kvman couldn't start your browser; it keeps running. | Copy the URL kvman printed into a browser, or use `--no-open` to stop trying. |

## Something fails in the app

| Code | What it means | What to do |
|---|---|---|
| `VALIDATION_FAILED` | What you entered isn't valid. The fields in question are marked, and the first reason shows. | Fix the marked fields and try again. |
| `NOT_FOUND` | Something you asked for doesn't exist (a folder you opened, a workspace closed in another tab, a setting). | Reload the page and pick it again. |
| `FORBIDDEN_ORIGIN` | A request didn't come from kvman's own address (`127.0.0.1` or `localhost` with its port). | Open kvman at the URL it printed. Don't put it behind another address or proxy. |
| `TOO_LARGE` | Something went over a limit, such as a file over 1 GiB. | Use something smaller. |
| `TIMEOUT` | A job ran longer than its time limit. | Try again, or split the work. |
| `CANCELLED` | You (or something) stopped the job. | Start it again if you still want it. |
| `INTERRUPTED` | kvman stopped, or died, while the job ran. | Start it again. |
| `WORKER_CRASHED` | The part of kvman that ran the job stopped unexpectedly. | Try again; if it repeats, look in `logs/kvman.log` in your home folder. |
| `HANDLER_FAILED` | An extension failed in a way it didn't explain. The details are in the log, never shown. | Look in `logs/kvman.log`, and tell the extension's author. |
| `PROCESS_RUNNING` | A preview (or another long-running process) with that name already runs. | Stop it first (`preview stop`). |

## Providers and models

| Code | What it means | What to do |
|---|---|---|
| `kvai/NO_MODEL` | No default model is chosen. | Connect a provider and choose a model on the **Models** page. |
| `kvai/KEY_MISSING` | The model's provider has neither an API key nor a plan sign-in. | Connect the provider on the **Models** page. |
| `kvai/RATE_LIMITED` | The provider says you called too often or used up your quota. | Wait and try again, or use another model. |
| `kvai/SIGNIN_EXPIRED` | The plan sign-in no longer works. | Sign in again on the provider's page. |

## Building kvman

| What you see | What to do |
|---|---|
| The agent says there is no connector `kvman`, `ext`, `preset`, `preview`, or `docs` | Type `/build-kvman` in that chat first: the tools for changing kvman are off until you do. |
| `kvbuilder/NPM_FAILED` while building an extension | Install Node.js with npm and check your network; the files the agent wrote are kept, so ask it to run `npm install` again. |
| `kvbuilder/FOLDER_NOT_EMPTY` | Ask for a new or empty folder. |
| `kvbuilder/NOT_A_PROJECT` | The folder has no `package.json` with a `kvman` field. |
| `kvbuilder/NO_FREE_PORT` | Ports 3738 to 3837 are all in use; stop something that uses them. |
| `kvbuilder/PREVIEW_FAILED` | The preview didn't start; the message ends with its last log lines. |

## Migrating from kvdev

Older kvman versions had an extension called **kvdev** and a `dev` preset. kvdev is now **kvbuilder**, and its tools are part of the `coder` preset: there is no `dev` preset any more. If you used `kvman --preset dev`, run plain `kvman`, or `kvman --preset coder`. Nothing else changes for you: the scaffold, the checks, and the preview now also work from a terminal, without kvman's agent.

## Still stuck

Look at the log: `logs/kvman.log` in your kvman home folder (`~/.kvman` by default). It records what happened, never your secrets or the content of your requests. Run `kvman --log-level debug` for more detail.

## Next

- [installing.md](installing.md)
- [presets.md](presets.md)
- [privacy-and-security.md](privacy-and-security.md)
