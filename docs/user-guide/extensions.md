# Extensions

This page is for anyone who wants to see what kvman is running and to add or remove extensions. When you finish, you can open the Extensions page, configure an extension, install one, remove one, and know when the change takes effect.

## What an extension is

kvman is built from extensions. The chat app is one (kvcoder), the web app is one (kvwebui), model access is one (kvai), and the tools that let the agent customize kvman are one (kvcustomizer). A preset chooses which extensions run. Everything you can do in kvman, an extension provides.

## The Extensions page

Open **Extensions** from the sidebar, below the divider. It shows:

- a row for every extension that runs now, with its title, package name, version, and where it came from (**Bundled**, **npm**, or **Local folder**);
- a search box, **Search extensions**, that filters the rows by title or package name;
- an **Add an extension** card below the list.

## Configure an extension

Click an extension to open its own page. Each extension decides what its page holds, so they differ:

- **Coder** has its settings in groups (the model and thinking level of a new chat, the shell approval, how many chats to keep) and its **Connectors**: everything the agent can use, each with a switch. Turn a connector off and the agent no longer sees it, from its next step. Turn `shell` off, for example, and the agent can't run command lines.
- **Models** has the default model, and a link to the Models page.
- **Interface** has the theme and the order of the sidebar.
- An extension with nothing to set says **This extension has nothing to configure.**

At the top of the page a switch, **All workspaces** or **Only \<your workspace\>**, says where your changes are stored; it covers everything on the page, the connector switches included. A change is saved as you make it, with no restart; see [Settings and secrets](settings-and-secrets.md). The page ends with the extension's **Secrets**.

## Add an extension

In **Add an extension**, fill in two fields and press **Install**:

| Field | What to type | Example |
|---|---|---|
| **Name** | The extension's package name | `@acme/notes` |
| **Source** | Where it comes from: `npm:<exact version>`, `path:<an absolute folder>`, or `bundled` | `npm:1.2.3` or `path:/home/me/notes` |

- `npm:` takes an exact version, such as `npm:1.2.3`. Ranges such as `^1.2.3` are not accepted.
- `path:` takes the folder of an extension project on this computer. kvman reloads it whenever you save a file in it.
- `bundled` puts back an extension that ships with kvman, if you removed it. It works only for a bundled extension's name.

**Install** stays grey until both fields have text. When it works, you see **Added. Restart kvman to apply.** and a new row marked **Starts after restart**. If something is wrong, for example the name is already in your preset, the card shows the reason and keeps what you typed, so you can fix it.

## Remove an extension

Open the extension's page and press **Remove**. kvman asks **Remove \<name\>?** right there, with **Remove** and **Cancel**. After you confirm you see **Removed. Restart kvman to apply.**, and the extension is marked **Removed after restart**. kvman won't remove an extension that another extension in your preset needs; it tells you which one.

You can remove any extension, including the ones that ship with kvman, because the preset is the app. If you remove kvwebui, there is no web page left to put it back, so keep a terminal handy.

## When a change takes effect

Adding and removing change your **preset**, the file that says which extensions run. kvman reads the preset when it starts, so a change applies the next time you start it.

1. Install or remove what you want. The page shows a banner, **Restart kvman to apply**, with how many changes are waiting.
2. In the terminal where kvman runs, press Ctrl+C, then run `kvman` again.
3. If you added an extension that isn't bundled, kvman asks in the terminal whether you trust it. Answer `y`, or start with `--yes` to accept without asking. A new version of an extension asks again.

Nothing is installed, loaded, or trusted when you press **Install**; that all happens at the start. If the same preset file is used by `kvman --preset …`, the change is saved in that file. The first change to the bundled `coder` preset saves your own copy as `<home>/presets/coder.json`; see [Presets](presets.md).

## Next

- [presets.md](presets.md)
- [settings-and-secrets.md](settings-and-secrets.md)
- [customizing-with-the-agent.md](customizing-with-the-agent.md)
