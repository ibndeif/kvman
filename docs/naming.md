# Naming in kvman: the cheat sheet

## Message types

`<namespace>.<segment>…`: lowercase, kebab-case segments, separated by dots. The first segment is your extension's namespace.

| Kind | Last segment | Examples |
|---|---|---|
| command (does something, one handler, returns its result) | an imperative verb | `pdf.translate`, `pdf.file.delete`, `agent.chat.start` |
| query (reads, never queued, never stored) | a read verb: `get`, `list`, `search`, `count`, `preview`, `validate` | `pdf.files.list`, `pdf.file.get` |
| event (happened, many subscribers) | a past participle | `pdf.translated`, `pdf.progress.updated` |

One name is never two kinds. A name outside the grammar needs a `namingException` with its reason.

## Public names are written in full, everywhere

Message types, entities, UI contributions, slots, renderer targets, and components are **public**: write the full name when you register it, call it, subscribe to it, and use it in a view.

```ts
ext.registerCommand('pdf.translate', { … });
await ctx.command('pdf.translate', { fileId, lang: 'ar' });
{ "command": "pdf.translate" }
```

**Private** names are plain and seen only by your extension: collections, logs, and schedules (`registerCollection('files')`, `registerLog('history:*')`). They match `^[a-z][a-zA-Z0-9-]*$`.

Error codes are `<namespace>/UPPER_SNAKE` (`pdf/NOT_FOUND`), registered with `ext.registerError` and thrown with `ctx.problem(code, { params })`. Kernel codes are `UPPER_SNAKE` (`VALIDATION_FAILED`).

## `register<Kind>`

Every registration method is `register` plus the kind it adds, and every definition has a required English `description`: `registerCommand`, `registerQuery`, `registerEvent`, `registerCollection`, `registerPage`, `registerPrompt`, `registerError`, … The exceptions read as sentences: `requestCapability`, `requestIsolation`, `requireTypes`, `requireComponents`, and `subscribe`.

A page's nav item is named `<namespace>.nav-<page>` by convention.

## The vocabulary

| Word | Means |
|---|---|
| `ctx.command` | sends a command and **waits** for its result |
| `ctx.send` | sends a command and does **not** wait (optionally with an `onReply` continuation) |
| `ctx.query` | reads |
| `ctx.publish` | announces an event |
| `ctx.live` | streams a preview (a live event) |
| `lane` | the ordering key of a handler: one message at a time per lane, lanes in parallel (`'file:{{ $payload.fileId }}'`) |
| `live` | a view's subscription to a live event, or the delivery class of such an event |
| `refreshOn` | the events after which a view's query runs again |
| `$item` | the record a view, a renderer, or an entity `route` shows |
| `calls` | the capability to call another extension's commands and queries |

The same words work on every surface: HTTP `POST /commands/:type` and `/queries/:type`, and the CLI's `kvman command` and `kvman query`.
