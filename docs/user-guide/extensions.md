# Extensions

This page is for anyone who wants to see what kvman is running and to add or remove extensions. When you finish, you can open the Extensions page, install an extension, remove one, and know when the change takes effect.

## What an extension is

kvman is built from extensions. The chat app is one (kvcoder), the web app is one (kvwebui), model access is one (kvai), and the tools that let the agent customize kvman are one (kvcustomizer). A preset chooses which extensions run. Everything you can do in kvman, an extension provides.

## The Extensions page

Open **Extensions** from the sidebar, below the divider. It shows:

- a card for every extension that runs now, with its name, version, where it came from (**Bundled**, **npm**, or **Local folder**), and how many commands, queries, settings, and handlers it has;
- a search box, **Search commands and queries**, that opens the cards whose commands or queries match;
- an **Add an extension** card at the top.

Open a card to see what the extension offers: each command and query with a short description and a **Public** badge when other programs may call it, its settings, and its handlers.

## Add an extension

In **Add an extension**, fill in two fields and press **Install**:

| Field | What to type | Example |
|---|---|---|
| **Name** | The extension's package name | `@acme/notes` |
| **Source** | Where it comes from: `npm:<exact version>`, `path:<an absolute folder>`, or `bundled` | `npm:1.2.3` or `path:/home/me/notes` |

- `npm:` takes an exact version, such as `npm:1.2.3`. Ranges such as `^1.2.3` are not accepted.
- `path:` takes the folder of an extension project on this computer. kvman reloads it whenever you save a file in it.
- `bundled` puts back an extension that ships with kvman, if you removed it. It works only for a bundled extension's name.

**Install** stays grey until both fields have text. When it works, you see **Added. Restart kvman to apply.** and a new card marked **Starts after restart**. If something is wrong, for example the name is already in your preset, the card shows the reason and keeps what you typed, so you can fix it.

## Remove an extension

Press **Remove** on a card. kvman asks **Remove \<name\>?** right there, with **Remove** and **Cancel**. After you confirm you see **Removed. Restart kvman to apply.**, and the card is marked **Removed after restart**. kvman won't remove an extension that another extension in your preset needs; it tells you which one.

You can remove any extension, including the ones that ship with kvman, because the preset is the app. If you remove kvwebui, there is no web page left to put it back, so keep a terminal handy.

## When a change takes effect

Adding and removing change your **preset**, the file that says which extensions run. kvman reads the preset when it starts, so a change applies the next time you start it.

1. Install or remove what you want. The page shows a banner, **Restart kvman to apply**, with how many changes are waiting.
2. In the terminal where kvman runs, press Ctrl+C, then run `kvman` again.
3. If you added an extension that isn't bundled, kvman asks in the terminal whether you trust it. Answer `y`, or start with `--yes` to accept without asking. A new version of an extension asks again.

Nothing is installed, loaded, or trusted when you press **Install**; that all happens at the start. If the same preset file is used by `kvman --preset …`, the change is saved in that file. The first change to the bundled `coder` preset saves your own copy as `<home>/presets/coder.json`; see [Presets](presets.md).

## Settings of an extension

An extension's settings are on the **Settings** page, grouped by extension. The Extensions page has a link to it: **Change an extension's settings on the Settings page**. Settings change at once, with no restart; see [Settings and secrets](settings-and-secrets.md).

## Next

- [presets.md](presets.md)
- [settings-and-secrets.md](settings-and-secrets.md)
- [customizing-with-the-agent.md](customizing-with-the-agent.md)
