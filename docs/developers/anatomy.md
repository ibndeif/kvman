# Anatomy of an extension

This page is for anyone writing an extension. When you finish, you can read an extension's `package.json` and entry, choose its namespace, decide what is public, and understand every way kvman can refuse to load it.

## The package

An extension is an npm package whose `package.json` has `main` and a `kvman` field:

```json
{
  "name": "@me/notes",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "peerDependencies": { "@kvman/sdk": "^0.1.0" },
  "kvman": {
    "namespace": "notes",
    "source": "src/index.ts",
    "dependencies": { "@kvman/kvai": "^0.1.0" },
    "web": "dist/web"
  }
}
```

| Field | Meaning |
|---|---|
| `main` | The built entry, which `bundled` and `npm:` extensions load. |
| `kvman.namespace` | The prefix of every name the extension registers. Required. `kernel` is the kernel's own and can't be used. |
| `kvman.source` | Optional. For a `path:` extension, kvman loads this file directly, with Node's type stripping (erasable TypeScript only: no enums, namespaces, or parameter properties). With none, it loads `main`. |
| `kvman.dependencies` | Other extensions this one needs, with version ranges. kvman checks they are present and in range, and loads them first. |
| `kvman.web` | Optional. A folder kvman serves at `/web/<namespace>/`, for Vue components ([components.md](components.md)). |

An unknown key in the `kvman` field fails the load. `@kvman/sdk` must be a **peer dependency**: at runtime every extension shares the kernel's own copy, and so its `z` (zod). Build schemas with the SDK's `z`, never with your own zod.

## The entry

The entry default-exports one function that receives `ctx` and only registers:

```ts
import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('notes.greeting.get', {
    description: 'Gives the greeting.',
    public: true,
    input: z.object({}),
    output: z.object({ text: z.string() }),
    handle: () => ({ text: 'Hello from notes!' }),
  });
};
```

It runs once per worker, when the worker loads. Registrations are sealed when it returns: a later `register*` call fails `EXTENSION_INVALID`. Handlers keep no in-memory state between jobs; anything that must last goes in the store ([storage.md](storage.md)).

## Names and namespaces

- Every command, query, and setting name starts with `<namespace>.`, lowercase, with kebab-case segments (setting keys use lower camelCase segments). A name registered twice, or outside the namespace, fails the load.
- A **command** ends in an imperative verb (`notes.note.add`); a **query** ends in a read verb (`get`, `list`, `search`, `count`).
- Two extensions can't claim one namespace.
- Error codes are `<namespace>/UPPER_SNAKE` ([errors.md](errors.md)).

## Public and private

A registration is **private** by default: only its own extension can call it. With `public: true`, other extensions and HTTP clients can call it too. Calling a private name from outside fails `NOT_PUBLIC`. `public` is the only check between extensions: a caller doesn't have to declare the callee as a dependency (declared dependencies are for presence, versions, load order, and type imports).

## Sources

A preset names where each extension comes from ([presets.md](presets.md)):

| Source | Meaning |
|---|---|
| `bundled` | A core extension that ships with kvman (kvai, kvwebui, kvcoder, kvbuilder). |
| `npm:<exact version>` | kvman runs `npm install --ignore-scripts --omit=dev --legacy-peer-deps` for it into `<home>/extensions/<name>@<version>`. npm must be on the PATH. |
| `path:<folder>` | A folder on this computer, relative to the preset file. Hot reloads ([preview-and-hot-reload.md](preview-and-hot-reload.md)). |

A version that isn't bundled is loaded only after you accept it: at start, kvman lists the name, version, and source of each version not yet accepted and asks `y` or `N` in the terminal (`--yes` accepts). With no terminal and no `--yes`, it refuses to start.

## Load order

Extensions load in dependency order. Handlers for `kernel.started` run in that order too ([jobs.md](jobs.md)).

## Why a load fails

kvman stops with `EXTENSION_INVALID`, naming the extension and the reason, when:

- the manifest is invalid: no `main`, no `@kvman/sdk` in `peerDependencies`, or an unknown key in the `kvman` field;
- a dependency is missing or out of range;
- the extension's `@kvman/sdk` peer range doesn't include the kernel's SDK version;
- dependencies form a cycle (the message prints it, for example `@a/x → @b/y → @a/x`);
- two extensions claim one namespace, or one claims `kernel`;
- a registered name doesn't start with `<namespace>.`, or is registered twice;
- a registration is invalid (for example, no description);
- the entry throws;
- a catalog is unreadable or a key lies outside the namespace;
- an `npm:` install fails, or you decline the trust question.

`kvman-check` runs most of these checks in a test kernel, one at a time, so run `npm run check` after every change.

## Next

- [sdk.md](sdk.md)
- [jobs.md](jobs.md)
- [localization.md](localization.md)
