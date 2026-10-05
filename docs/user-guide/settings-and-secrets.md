# Settings and secrets

This page is for anyone who wants to change how kvman or one of its extensions behaves, or to store an API key safely. When you finish, you can change a setting for everyone or for one workspace, reset it, add and delete a secret, and know what kvman never shows or writes down.

## Where settings are

- **Settings**, in the sidebar, holds kvman's own settings: its language, its port, and how it runs jobs. They are the same in every workspace.
- **Extensions**, in the sidebar, lists what kvman runs. Open an extension to configure it: each extension lays out its own configuration there. Coder, for example, has its model and thinking level, and the list of its connectors with a switch for each and, where a connector has settings of its own, a cog that opens them; see [Extensions](extensions.md).

Both pages show a setting the same way:

- a title and a description;
- a control that fits the setting: a choice, a number, or a text field;
- **Changed** and a reset, when its value was set in the place you are editing;
- **Details**, which opens to show its key, such as `kvwebui.theme`, and where its value comes from: **Default**, **Set for all workspaces**, **Set for this workspace**, or **Set by the \<preset\> preset**.

The Settings page also has a search box that filters by title, description, or key.

## Change and reset

1. On an extension's page, pick where the change applies with the switch at the top: **All workspaces** or **Only \<your workspace\>**. kvman's own settings always apply to all of them.
2. Change the control. A choice is saved when you pick it; a field is saved when you press Enter or leave it. **Saved** shows beside it.

The change applies at once, with no restart, except for `kernel.port`, `kernel.workers`, and `kernel.workerConcurrency`, which apply at the next start. A setting that is the same in every workspace says so, and is stored for all of them.

A setting applies to every workspace unless you set it for one. kvman uses the value for **this workspace** if there is one, otherwise the value for **all workspaces**, otherwise the preset's value, otherwise the default.

To undo a value you set, press **Reset** (for all workspaces) or **Use the value for all workspaces** (for this workspace). The setting falls back to the next source. While you are on **All workspaces**, a setting your workspace has its own value for can't be edited: switch to the workspace to change or undo it.

If a value isn't valid, kvman keeps the old one in effect, leaves what you typed in the field, and shows the reason under it. A setting the preset locks is shown with a lock and can't be changed here; change it in the preset (see [Presets](presets.md)).

## kvman's own settings

| Key | Meaning | Default |
|---|---|---|
| `kernel.port` | The port kvman listens on, from the next start. `--port` overrides it. | 3737 |
| `kernel.workers` | How many worker threads run extension code, from the next start. | your CPU cores minus 1, at least 1 |
| `kernel.workerConcurrency` | How many jobs one worker runs at once, from the next start. | 32 |
| `kernel.language` | The language of the app: `en` or `ar`. | `en` |
| `kernel.jobs.retentionDays` | How many days finished jobs are kept. | 7 |
| `kernel.web.home` | The extension whose web app is served at `/`. | `kvwebui` |

Extensions have their own, such as `kvwebui.theme` (light, dark, or the same as the system) and `kvai.defaultModel`, each on its extension's page.

## Secrets

A secret is a value such as an API key, and it belongs to one extension. Providers you connect through the **Models** page keep their keys as secrets. Every extension's page (open it from **Extensions**) ends with a **Secrets** section:

- It lists that extension's secrets by name. **Values are never shown.**
- **Add a secret** takes a **Name** and a **Value** (a password field), then **Save**.
- **Delete** asks **Delete the secret \<name\>?** and removes it after you confirm.

Where secrets are kept and what never happens to them:

- They live only in `secrets.json` in your kvman home folder, readable only by you (mode `0600` on Linux and macOS; the access rules of your user folder on Windows).
- They are never written to the database, to settings, to logs, or to any answer kvman sends to the browser, so nothing in the app can read one back to you.
- Saving a secret never queues work, so the value can't end up in a job record.

If you lose a key, make a new one at the provider and save it again; there is nothing to recover from kvman.

## Next

- [models-and-providers.md](models-and-providers.md)
- [privacy-and-security.md](privacy-and-security.md)
- [presets.md](presets.md)
