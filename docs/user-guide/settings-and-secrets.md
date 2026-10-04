# Settings and secrets

This page is for anyone who wants to change how kvman behaves, or to store an API key safely. When you finish, you can change a setting for everyone or for one workspace, reset it, add and delete a secret, and know what kvman never shows or writes down.

## The Settings page

Open **Settings** from the sidebar. Every setting kvman and its extensions offer is listed, grouped by extension (kvman's own first). Each one shows:

- a title and a description, and its key in small print, such as `kvwebui.theme`;
- a control that fits the setting: a switch, a choice, a number, or a text field;
- **Applies to** with **All workspaces** or **This workspace**, when the setting allows both;
- a badge saying where the value comes from: **Default**, **Set for all workspaces**, **Set for this workspace**, or **Set by the \<preset\> preset**;
- **Save** when you have changed the value, and a reset.

A setting applies to every workspace unless you set it for one. kvman uses the value for **this workspace** if there is one, otherwise the value for **all workspaces**, otherwise the preset's value, otherwise the default.

## Change and reset

1. Change the control. **Save** appears.
2. Pick **Applies to**: **All workspaces** or **This workspace**.
3. Press **Save**. The change applies at once, with no restart, except for `kernel.port`, `kernel.workers`, and `kernel.workerConcurrency`, which apply at the next start.

To undo a value you set, press **Reset** (for all workspaces) or **Use the value for all workspaces** (for this workspace). The setting falls back to the next source.

If a value isn't valid, kvman keeps the old one and shows the reason under the control. A setting the preset locks is shown with a lock and can't be changed here; change it in the preset (see [Presets](presets.md)).

## kvman's own settings

| Key | Meaning | Default |
|---|---|---|
| `kernel.port` | The port kvman listens on, from the next start. `--port` overrides it. | 3737 |
| `kernel.workers` | How many worker threads run extension code, from the next start. | your CPU cores minus 1, at least 1 |
| `kernel.workerConcurrency` | How many jobs one worker runs at once, from the next start. | 32 |
| `kernel.language` | The language of the app: `en` or `ar`. | `en` |
| `kernel.jobs.retentionDays` | How many days finished jobs are kept. | 7 |
| `kernel.web.home` | The extension whose web app is served at `/`. | `kvwebui` |

Extensions add their own, such as `kvwebui.theme` (light, dark, or the same as the system) and `kvai.defaultModel`.

## Secrets

A secret is a value such as an API key. Providers you connect through the **Models** page keep their keys as secrets. The Settings page has a **Secrets** section at the bottom:

- It lists each secret by extension and name. **Values are never shown.**
- **Add a secret** takes an **Extension**, a **Name**, and a **Value** (a password field), then **Save**.
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
