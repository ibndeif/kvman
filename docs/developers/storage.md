# Storage, files, settings, and secrets

This page is for anyone whose extension keeps data. When you finish, you can store documents and values, choose between workspace and home-wide storage, run a transaction, keep files, declare and read settings, and handle a secret without ever exposing it.

All calls return a Promise, except the calls on a transaction's `tx`.

## The store

There is one SQLite database (WAL mode). The kernel owns every table: extensions never see SQL and have no migrations. `ctx.store` is the current job's **workspace**; `ctx.store.global` is **home-wide**. Both hold only your extension's data.

**Key-value:**

```ts
await ctx.store.kv.set('lastRun', { at: Date.now() });
const last = await ctx.store.kv.get('lastRun');   // the value, or undefined
await ctx.store.kv.delete('lastRun');
```

**Collections** hold JSON documents with kernel-assigned ids (UUIDv7). The schema is the zod schema of a document without its `id`: writes are checked against it, and reads parse through it, so a stored document that no longer fits fails `VALIDATION_FAILED`.

```ts
const notes = ctx.store.collection('notes', z.object({ text: z.string(), pinned: z.boolean() }));
const note = await notes.insert({ text: 'Buy milk', pinned: false });          // → { id, text, pinned }
await notes.get(note.id);                                                      // → the document, or undefined
await notes.find({ pinned: true }, { limit: 50, order: 'desc' });
await notes.count({ pinned: true });
await notes.update(note.id, { pinned: true });                                 // shallow merge; null is stored as null
await notes.delete(note.id);
```

- `find(filter, { limit, order? })`: equality filters on top-level fields (`string`, `number`, `boolean`, or `null` values), a **required** `limit` (at most 1000, else `VALIDATION_FAILED`), and `order` of `'asc'` (default, oldest first) or `'desc'`.
- `update` and `delete` of a missing id fail `NOT_FOUND`.
- A document or a kv value is JSON of at most 16 MiB (`TOO_LARGE`).

**Atomicity.** Each call commits on its own. `ctx.store.transaction(fn)` runs `fn(tx)` in one SQLite transaction. `tx` has the store's shape (including `tx.global`), but its calls are **synchronous**, so the lock is never held across an `await`. If `fn` returns a Promise, the transaction is rolled back and fails `VALIDATION_FAILED`.

```ts
await ctx.store.transaction((tx) => {
  const note = tx.collection('notes', noteSchema).insert({ text: 'a', pinned: false });
  tx.kv.set('count', 1);
  return note;
});
```

## Workspaces

A workspace is a folder, `{ id, name, path }`. The user's home folder is the built-in **Home** workspace (id `home`), always open. Other folders are opened with `kernel.workspace.open` and remembered across restarts. Every job has a workspace; `ctx.job.workspace.path` is its folder, and you use `node:fs` on it directly for work inside a job. Closing a workspace pauses it: its data stays, its queued jobs and schedules wait, and calls naming it fail `NOT_FOUND`.

## Files

Files are content the kernel keeps for extensions and uploads (`files/<id>` in the home, plus a `File` row `{ id, name, type, size, owner, workspaceId, createdAt }`).

```ts
const file = await ctx.files.write('report.txt', 'hello', 'text/plain');
const row = await ctx.files.get(file.id);
const buffer = await ctx.files.read(file.id);
const absolute = await ctx.files.path(file.id);     // for streaming
await ctx.files.unlink(file.id);
```

Any extension can read any file of the job's workspace by id; a file of another workspace is `NOT_FOUND`. Only the owner can unlink a file (a user upload by the user or any extension); otherwise `NOT_PUBLIC`. A file is at most 1 GiB. There is no deduplication and no garbage collection.

## Settings

```ts
ctx.registerSetting('notes.greeting', { description: 'The greeting shown above notes.', schema: z.string(), default: 'Hello' });
const greeting = await ctx.settings.get('notes.greeting');
await ctx.settings.set('notes.greeting', 'Hi', { scope: 'global' });   // your own keys only
```

- A key starts with your namespace; its segments are lower camelCase.
- **Scopes:** `['global', 'workspace']` (default), `['global']`, or `[]` for **preset-only** (only the preset gives it a value; the Settings page shows it locked).
- **Resolving:** the workspace value, else the global value, else the preset's, else the default. A key registered without `default` must get its value from the preset, or kvman stops at start with `VALIDATION_FAILED`.
- Values are stored in SQLite and checked against the schema when set. A stored value that no longer fits is skipped with a logged warning, and the next source is used.
- Any extension reads any key; you write only your own (another extension's key fails `NOT_PUBLIC`). The user changes any key with `kernel.settings.set`.

## Secrets

```ts
await ctx.secrets.set('apiKey', value);
const key = await ctx.secrets.get('apiKey');      // the string, or undefined
await ctx.secrets.delete('apiKey');
```

Secrets belong to your extension and are home-wide. They live **only** in `secrets.json` (mode 0600 on Linux and macOS, the user profile folder's rules on Windows, replaced atomically). A secret is never written to SQLite, settings, job rows, logs, or any HTTP response.

- A command that takes a secret must be `syncOnly: true`, so its input never lands in a job row.
- Never put a secret in `ctx.log` fields, a progress chunk, a Problem's params, or an error message.
- The user sets and deletes secrets with `kernel.secrets.*`, which never returns a value.

## Next

- [sdk.md](sdk.md)
- [jobs.md](jobs.md)
- [kernel-api.md](kernel-api.md)
