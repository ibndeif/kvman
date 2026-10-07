# Conventions

The rules every kvman extension follows. `sdk`, `i18n`, and `presets` explain the API behind them.

## Names

- A command or query is `<namespace>.<segment>…`: lowercase, kebab-case segments, written in full everywhere: `ctx.exec('notes.note.add', …)`.
- A command ends in an imperative verb (`add`, `set`, `run`, `delete`); a query ends in a read verb (`get`, `list`, `search`, `count`). A query never writes.
- Everything an extension registers starts with its own namespace.

## Public and private

- A registration is private unless `public: true`. Only public ones are callable from outside the extension: the HTTP API, other extensions, the agent.
- Every field of a public input has a description: `.describe('The note.')`.

## Errors

- Throw `ctx.problem('<namespace>/UPPER_SNAKE', params)`. The kernel's own codes are plain `UPPER_SNAKE` (`VALIDATION_FAILED`, `NOT_FOUND`, …).
- Never throw a string, swallow an error, or return `null` to mean "failed".
- Each code has an `en` and an `ar` text (`<namespace>.errors.<CODE>`, see `i18n`).

## Jobs

- Everything runs as a job. `ctx.exec` runs one now and returns its output; `ctx.execAsync` and `ctx.schedule` queue work that survives a restart and retries.
- A handler's work ends when it returns: no `setTimeout`, `setInterval`, or unawaited promise that outlives it.
- Long work is `execAsync` or `ctx.schedule`; a long-lived child process is `ctx.processes`.

## No events

- There are no events or listeners. An owner offers fixed points, and others register handlers for them.
- The kernel's job and lifecycle points take `ctx.registerHandler` (for example `kernel.started`; the list is in `sdk`).
- An extension may offer its own registries, such as kvcoder's connectors, sections, and slash commands.

## Storage

- `ctx.store` holds kv and JSON collections, per workspace plus `global`.
- Each call commits alone; `transaction((tx) => …)` is synchronous.
- Validate what is read back with a zod schema.

## Settings

- Register each with a zod schema and a description.
- `scopes` is `['global', 'workspace']` (the default), `['global']`, or `[]` for a key only the preset sets.
- A value resolves workspace, then global, then preset, then default. A key with no default must be set by the preset (see `presets`).

## Secrets

- Only through `ctx.secrets`. Never log a secret, store it elsewhere, or return it from a command or query.

## Validation

- Every boundary has a zod schema: inputs, outputs, settings, and persisted JSON.
- Use the `z` from `@kvman/sdk`.

## Text for people

- Text a person sees is always a translation key with `en` and `ar` entries in `locales/` (see `i18n`).
- Text for a model (descriptions of commands and queries, docs pages) is English.
- Styles use logical CSS only, so right-to-left pages mirror.

## UI

- The kernel and kvwebui hold no product concept.
- An extension owns its UI and offers it through the public query `<namespace>.ui.get` (pages, nav items, panels, status items, and their views, which may use its own components).
- The preset places it: `kvwebui.home`, `kvwebui.title`.

## Documenting an extension

- The public queries `<namespace>.docs.list` and `<namespace>.docs.get` serve its Markdown pages to agents.

## Dependencies between extensions

- Declare them in `kvman.dependencies`.
- Import another extension only as a type (`import type`), or a subpath it exports. Never import the kernel.

## Checks

- Run `npm run check` and `npm test` after every change.
- Tests are deterministic and use `createTestKernel` from `@kvman/testkit` (see `sdk`).
