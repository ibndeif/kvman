# ADR 0152 — The LLM model registry, refreshes, defaults, and provider conflicts

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.9
- **Decided by**: the product owner

## Question

`03` §3.8, §3.12 and `05` §5.11 leave these open:

- **`ModelInfo`:** the shape `kernel.llm.models.list` and `ctx.llm.models()` return.
- **Refresh:** what a model refresh does ("at enable, on provider config change, and on `kernel.llm.models.refresh`").
- **Workspace defaults:** how `kernel.llm.defaults.set` writes them. They are stored in the applied preset, and every preset write bumps its revision.
- **`PROVIDER_CONFLICT`:** where it is checked.

## Options

- **`ModelInfo`:**
  1. **The stored model row.**
  2. The row plus `defaultFor`.
- **Refresh:**
  1. **Replace the provider's rows.**
  2. Static models at enable, listed models on demand.
- **Workspace defaults:**
  1. **A preset write with cause `update`.**
  2. Like config: no revision.
- **Conflict:**
  1. **Every enabled-set check.**
  2. Enable only.

## Decision

Option 1 in each case.

**`ModelInfo`**

```ts
type ModelInfo = ModelDef & { id: string; extension: string; source: 'static' | 'listed' };
```

- `ModelDef` is the protocol's `modelDefSchema` (`provider`, `title`, `description`, `contextWindow`, `maxOutput`, `cost?`, `capabilities`).
- Results are sorted by provider, then id.
- They hold only models whose provider's extension is enabled in the workspace; for a call without a workspace, enabled in at least one.

**Refresh**

- A refresh rewrites one provider's `llm_models` rows:
  - its static models from the active manifest (`source: 'static'`);
  - plus what its `listModels` returns (`source: 'listed'`), skipping a listed model whose id a static model has.
- `listModels` runs without a workspace (ADR 0153).
- A refresh runs:
  - after an enable (or apply, or update) that makes the provider's extension enabled in some workspace;
  - after a config or secret write of that extension;
  - after a reload of it;
  - on `kernel.llm.models.refresh { provider? }` (admin), for one provider or all.
- A failing `listModels` keeps the provider's previous listed rows and logs a warning with the provider id only.
- Uninstall deletes the extension's rows, whether it keeps or deletes the extension's data: they are derived from the manifest and `listModels`, and the next enable after a reinstall refreshes them (the product owner, correcting `06` §6.8, which listed them under delete data).
- `kernel.llm.models.changed { provider }` follows each refresh that changed rows.

**Defaults**

- `kernel.llm.defaults.set { workspaceId?, purpose, model }` (admin) with `workspaceId`:
  - writes `llm.defaults[purpose]` of the applied preset;
  - bumps its revision;
  - publishes `kernel.preset.changed { cause: 'update' }` and `kernel.llm.defaults.changed { workspaceId }`.
- Without `workspaceId` it writes the `kernel_settings` row `llm.defaults` and publishes `kernel.llm.defaults.changed {}`.
- `model: null` clears the purpose.
- It fails:
  - `LLM_MODEL_NOT_FOUND` for a model that is not in the workspace's model list (for the global default, any enabled provider's model);
  - `PRESET_REQUIRED` for a workspace with no applied preset.
- `kernel.llm.defaults.get { workspaceId? }` answers `{ workspace, global, effective }`, each a `Partial<Record<purpose, ModelRef>>`. `effective` is the workspace value where set, else the global one. `workspace` is `{}` without a workspace.

**`PROVIDER_CONFLICT`**

- Two enabled extensions registering one provider id conflict.
- The check runs wherever namespaces are checked today: enable, preset apply stage and apply, preset update, reload (in each workspace where the extension is enabled), and `kernel.validate { workspaceId }` (as an issue).

## Consequences

- `03` §3.8 and §3.12, and `05` §5.11, state these rules; `06` §6.8 deletes `llm_models` rows at every uninstall.
- M2.2-H5 and M2.2-E41 expect no model rows after an uninstall that keeps data.
- `@kvman/protocol` gains `ModelInfo` and the request and result schemas of the `kernel.llm.*` types.
