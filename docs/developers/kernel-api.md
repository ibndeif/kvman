# The kernel API

This page is for anyone who calls kvman from an extension, a script, or a UI. It lists every command and query the kernel itself registers, with input, output, and what can go wrong. When you finish, you can open a workspace, change a setting, manage secrets, inspect jobs and files, read what is loaded, and edit the preset.

All of them are **public**. There is no sandbox in this phase, so extensions can call them too, with `ctx.exec('kernel.…', input)`. Over HTTP, a query is `POST /api/queries/<name>` and a command is `POST /api/commands/<name>` with `{ "input": … }` ([http-api.md](http-api.md)). Types are in `@kvman/sdk` (`kernelCommandSchemas`, `kernelQuerySchemas`).

## Workspaces and folders

| Name | Kind | Input → output |
|---|---|---|
| `kernel.workspace.open` | command | `{ path }` → `Workspace`. `path` is an absolute path to an existing folder (`VALIDATION_FAILED` otherwise), resolved with `realpath`; the existing workspace if open, the remembered one if it was open before. |
| `kernel.workspace.close` | command | `{ workspaceId }` → `{}`. Pauses it. Home can't be closed (`VALIDATION_FAILED`). |
| `kernel.workspace.list` | query | `{}` → the open `Workspace[]`, Home first, then in the order first opened. |
| `kernel.folder.list` | query | `{ path?, hidden? }` → `{ path, parent, folders: [{ name, path }], truncated }`: sub-folders of a folder on this machine, for choosing a workspace. |
| `kernel.folder.create` | command | `{ path, name }` → `{ path }`: makes the folder `name` inside the existing folder `path`. `name` is one folder name; an empty or blank name, one with a separator, `.`, `..`, a name that exists, or a folder that can't be written fails `VALIDATION_FAILED`. |

A `Workspace` is `{ id, name, path }`.

## Settings and secrets

| Name | Kind | Input → output |
|---|---|---|
| `kernel.settings.set` | command | `{ key, value, scope: 'global' \| 'workspace' }` → `{}`. A key in a scope it doesn't have, or a value that fails its schema, is `VALIDATION_FAILED`; an unknown key `NOT_FOUND`. |
| `kernel.settings.reset` | command | `{ key, scope }` → `{}` |
| `kernel.settings.list` | query | `{}` → `[{ key, description, schema, scopes, value, source }]`; `schema` is JSON Schema, `source` is `workspace`, `global`, `preset`, or `default`. |
| `kernel.secrets.set` | command | `{ extension, name, value }` → `{}`. **Sync only**: `async` or a schedule fails `VALIDATION_FAILED`, so the value never lands in a job row. |
| `kernel.secrets.delete` | command | `{ extension, name }` → `{}`. Deleting a missing secret does nothing. |
| `kernel.secrets.list` | query | `{}` → `[{ extension, name }]`. Never values. |

`extension` is the package name of an extension of the run (`NOT_FOUND` otherwise).

## Jobs and files

| Name | Kind | Input → output |
|---|---|---|
| `kernel.jobs.get` | query | `{ id }` → `Job`, of any workspace. |
| `kernel.jobs.list` | query | `{ status?, limit }` → `Job[]` in this workspace, newest first. |
| `kernel.files.get` | query | `{ id }` → `File` of this workspace. |
| `kernel.files.list` | query | `{ limit }` → `File[]` in this workspace, newest first. |
| `kernel.files.unlink` | command | `{ id }` → `{}`, with the access rules of [storage.md](storage.md). |

`limit` is required and at most 1000. A `Job` is `{ id, name, input, workspaceId, caller, status, attempts, retries, output?, problem?, createdAt, startedAt?, endedAt? }`; a `File` is `{ id, name, type, size, owner, workspaceId, createdAt }`.

## What is loaded

| Name | Kind | Input → output |
|---|---|---|
| `kernel.extensions.list` | query | `{}` → `[{ name, version, source, revision, namespace, commands, queries, settings, handlers }]`. `source` is `bundled`, `npm:…`, or `path:…`; `revision` starts at 0 and grows with each hot reload. Each command and query, private ones too, is `{ name, description, public, input, output }` (JSON Schema); each setting `{ key, description, scopes }`; each handler `{ point, description }`. The kernel itself isn't listed. |
| `kernel.registrations.list` | query | `{}` → `[{ name, kind, extension, public, description }]`: every command and query of the run, private ones too, with its owner and no schema. Use it instead of `kernel.extensions.list` when you only need to know what exists and whose it is: it is much smaller and faster. |
| `kernel.processes.list` | query | `{}` → `[{ extension, workspaceId, name, pid, startedAt }]`. |
| `kernel.health.get` | query | `{}` → `{ version, preset, mode, workers, uptimeMs, languages, rolledBack? }`: kvman's version, the preset's name, `web`, the pool size, the uptime, the language codes the loaded catalogs have, and, only for a start that came after an undone one, the Problem that start failed with. |

Schemas are converted with zod's `z.toJSONSchema`; a part JSON Schema can't express becomes `{}`.

## The preset

| Name | Kind | Input → output |
|---|---|---|
| `kernel.preset.get` | query | `{}` → `{ name, origin: 'bundled' \| 'home' \| 'file', file?, extensions, settings? }`: the preset as stored now. |
| `kernel.extensions.install` | command | `{ name, source }` → `{ file, restartRequired: true }`: adds the extension to the preset file. |
| `kernel.extensions.uninstall` | command | `{ name }` → `{ file, restartRequired: true }`: removes it. |
| `kernel.restart` | command | `{}` → `{ restarting: true }`: asks kvman to restart. It stops and starts again in the same process, with its arguments, lock, and terminal; running jobs are aborted, processes stop, and the preset is read again. Sync only. |

They write the preset file and nothing else; a restart applies the change. Details and errors: [presets.md](presets.md).

## An example

```sh
curl -s http://127.0.0.1:3737/api/queries/kernel.health.get \
  -H 'content-type: application/json' -d '{ "input": {} }'
# {"ok":true,"output":{"version":"0.1.0","preset":"coder","mode":"web","workers":3,"uptimeMs":4210,"languages":["en","ar"]},"jobId":"…"}

curl -s http://127.0.0.1:3737/api/commands/kernel.settings.set \
  -H 'content-type: application/json' -d '{ "input": { "key": "kvwebui.theme", "value": "dark", "scope": "global" } }'
```

## Next

- [http-api.md](http-api.md)
- [errors.md](errors.md)
- [presets.md](presets.md)
