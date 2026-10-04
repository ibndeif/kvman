# kvman user guide

This guide is for people who **use** kvman: you have it installed (or want to install it), and you want to build, fix, and manage things with its agent — without writing code yourself. By the end of the five-minute tour below, you will have kvman running in your browser, a model connected, a folder open, and a first answer from the agent.

Every page starts with who it is for, and ends with where to go next. All commands can be typed exactly as shown.

## The five-minute tour

### 1. Install

```sh
npm i -g kvman
```

You need Node.js 24. See [installing.md](installing.md) for details and platform notes.

### 2. Start it

```sh
kvman
```

kvman prints a URL such as `http://127.0.0.1:3737/?workspace=home` and opens it in your browser. Keep the terminal open; kvman runs in the foreground until you press Ctrl+C.

### 3. Connect a model

Open the **Models** page from the sidebar. Pick a provider — for example **Anthropic** with an API key, or **Claude** to sign in with your plan — and follow the button. Then pick the default model with **Change model**.

More detail: [models-and-providers.md](models-and-providers.md).

### 4. Open a folder

Click the workspace picker in the top bar (it says **Home**), choose **Open a folder…**, find your folder in the browser, and click **Open this folder**. kvman remembers opened folders across restarts.

More detail: [workspaces.md](workspaces.md).

### 5. Ask the agent for something

Open the **Chat** page and describe what you want: "List the files in this folder", "Explain what this project does", "Add a hello-world test". The agent shows you each command it wants to run and asks before risky ones.

More detail: [coding-app.md](coding-app.md).

## All pages

- [installing.md](installing.md) — installing kvman, every flag, the home folder, stopping, updating, platforms
- [first-run.md](first-run.md) — what happens the first time you start kvman
- [web-app.md](web-app.md) — the app in your browser: sidebar, pages, status bar, language, theme
- [workspaces.md](workspaces.md) — Home, folders, and what a second `kvman` does
- [models-and-providers.md](models-and-providers.md) — connecting AI providers, the default model, your own server
- [coding-app.md](coding-app.md) — chats, steps, the shell, approvals, connectors, artifacts, attachments
- [extensions.md](extensions.md) — what runs, installing and removing extensions
- [presets.md](presets.md) — what a preset is, making your own
- [settings-and-secrets.md](settings-and-secrets.md) — the Settings page, where secrets live
- [customizing-with-the-agent.md](customizing-with-the-agent.md) — asking the agent to customize kvman
- [building-extensions.md](building-extensions.md) — building an extension with the agent's help
- [troubleshooting.md](troubleshooting.md) — error codes in plain words, and the fix
- [privacy-and-security.md](privacy-and-security.md) — what stays on your machine, what leaves it

The developer documentation lives in [../developers/README.md](../developers/README.md); you only need it when you start writing code.

## Next

- [installing.md](installing.md)
- [first-run.md](first-run.md)
