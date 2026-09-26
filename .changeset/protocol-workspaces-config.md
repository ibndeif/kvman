---
"@kvman/protocol": minor
---

Add the workspace, enable, config, and secret shapes (M2.3): the payloads and results of `kernel.workspace.open`, `rename`, and `forget`, `kernel.workspaces.list`, `kernel.workspace.get`, `kernel.extension.enable` and `disable`, `kernel.config.get` and `set`, and `kernel.secret.set` and `clear`; the `kernel.workspace.opened`, `.renamed`, `.forgotten`, `kernel.extension.enabled`, `.disabled`, `.unquarantined`, and `kernel.config.changed` event payloads; `secrets.json`, secret names and values, and `configSecretFields` and `withoutSecretFields` for config schemas. Host frames gain the `config.get` and `secret.get` calls, and a unit of work carries `config` and `secrets` writes.
