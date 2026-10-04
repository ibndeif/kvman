# First run

This page is for your first start of kvman. You will be able to read the terminal output, accept (or refuse) a new extension, and open the folder you want to work in.

## Start it

```sh
kvman
```

## What the terminal shows

Each line is one log record, `HH:MM:SS LEVEL message`, on stderr. The important line is the URL on stdout:

```text
http://127.0.0.1:3737/?workspace=home
```

kvman also opens that URL in your browser. The `?workspace=…` part tells kvman's web app which folder to start in:

- If you started `kvman` inside a folder, that folder opens.
- If you started it in your home folder (or there is no other folder), kvman opens **Home** instead.

With `--no-open`, kvman prints the URL but doesn't open the browser. With `--log-level debug`, you see more lines.

## The trust question

Before loading anything, kvman lists every extension version in your preset that is not bundled with kvman and that you haven't accepted before, and asks in the terminal:

```text
Trust this extension? y/N
```

It shows the name, version, and source. Think of trust like installing an app: a non-bundled extension runs code on your machine with no sandbox in this phase, so you decide once per version. Your answer is remembered, so you only see the question again for a new version or a different source.

- Answer `y` to allow it.
- Any other answer refuses it, kvman stops with `EXTENSION_INVALID`, and nothing runs.
- `kvman --yes` accepts all of them without asking.
- Started with no terminal attached and no `--yes`, kvman refuses to start rather than guess.

## In the browser

The page opens on kvman's home page — for the bundled `coder` preset that is the **Chat** page, in your start workspace. From here you can:

1. Connect a model (see [models-and-providers.md](models-and-providers.md)).
2. Open another folder (see [workspaces.md](workspaces.md)).
3. Ask the agent something (see [coding-app.md](coding-app.md)).

## Opening a folder as the start folder

The folder kvman opens at start is the folder you start `kvman` from:

```sh
cd ~/projects/my-app
kvman
```

kvman opens `~/projects/my-app` as a workspace and prints a URL ending in `?workspace=<id>` for it. If that folder was open in kvman before, you get the same workspace back, with its chats and settings. A second `kvman` in the same home hands its folder over to the running one ([workspaces.md](workspaces.md)).

## Next

- [web-app.md](web-app.md)
- [workspaces.md](workspaces.md)
