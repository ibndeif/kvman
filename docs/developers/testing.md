# Testing extensions

This page is for anyone writing tests for an extension. When you finish, you can run a real kernel in a test, call your commands as a user or as another extension, control time, restart the kernel, and fake a model.

The testkit, `@kvman/testkit`, runs the **real** kernel in-process with a temporary home and no HTTP. Workers, validation, storage, and everything else are real. A scaffolded project already depends on it.

## A first test

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestKernel } from '@kvman/testkit';

test('notes.note.add stores a note', async () => {
  const kernel = await createTestKernel({ extensions: ['./'] });
  try {
    const { id } = await kernel.exec('notes.note.add', { text: 'hi' });
    assert.ok(id);
  } finally {
    await kernel.close();
  }
});
```

`extensions` are folders, relative to the working folder; each loads as a `path:` extension. If your extension depends on others (`kvman.dependencies`), list their folders too. `npm test` in a scaffold runs these with `node --test`.

## The test kernel

```ts
const kernel = await createTestKernel({ extensions: ['./'], settings: { 'notes.greeting': 'Hi' }, secrets: { '@me/notes': { apiKey: 'x' } } });
await kernel.exec('notes.note.add', { text: 'hi' });                           // as the user
await kernel.exec('notes.note.add', { text: 'hi' }, { as: '@acme/other' });    // as an extension
await kernel.exec('notes.note.add', { text: 'hi' }, { workspaceId: ws.id });   // in a workspace (default Home)
const jobId = await kernel.execAsync('notes.index.run', {});
const job = await kernel.waitForJob(jobId);
await kernel.clock.advance(60_000);                                            // the fake clock
await kernel.restart();                                                        // stop as Ctrl+C does, start again on the same home
await kernel.close();
```

- `settings` are the run's preset settings; `secrets` are `{ "<extension package>": { "<name>": "<value>" } }`, written before the extensions load. A test kernel starts one worker unless `settings` set `kernel.workers`.
- Its Home workspace is a temporary folder, `kernel.homeFolder`; `kernel.home` is the temporary kvman home. `close()` removes both.
- `exec` and `execAsync` take `{ as?, workspaceId?, onProgress? }`. `onProgress(chunk)` receives the progress chunks (`{ source, data }`) of the call's root job; `kernel.watch(jobId, onProgress)` → `stop` does so for any job, as its HTTP stream does.
- `kernel.cancel(jobId)` cancels a job.

## Time

The fake clock drives the kernel's own timers: retries, schedules, retention, and ids. It doesn't change `Date` inside handlers. `await kernel.clock.advance(ms)` resolves once no job is running or due. `restart({ stoppedForMs })` moves it while the kernel is stopped.

## Faking a model

```ts
import { startFakeOpenAI } from '@kvman/testkit/fake-openai';

const fake = await startFakeOpenAI();
await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
fake.reply({ chunks: [{ text: 'Hello!' }] });
// … call kvai.complete with model 'fake/…' …
fake.requests();    // every request so far
await fake.close();
```

The fake server is an OpenAI-compatible streaming server on 127.0.0.1. Each queued reply answers one request, in order, as a stream of text, thinking, or tool calls (`{ toolCall: { id, name, arguments } }`), or as an error status (`{ status, body }`).

## `kvman-check`

`npm run check` loads the extension alone in a test kernel and reports, as readable text or with `--json` as `[{ file?, message, hint }]`:

- a refused load (one problem at a time, since a load stops at its first error);
- a public input field with no description;
- missing locale keys: a key one catalog has and another lacks, every key your `ui.get` uses, `<namespace>.title`, and each setting's `<key>.title`;
- warnings from a scan of `src/**/*.ts`: every `setInterval(` and every `setTimeout(` whose statement doesn't start with `await`;
- warnings about a half-done or wrong docs pair ([documenting-your-extension.md](documenting-your-extension.md)).

It exits 1 on an error and 0 with only warnings.

## Writing good tests

- Tests are deterministic: use the fake clock and ids, no network, no real `~/.kvman` (the testkit never touches it), and no order dependence.
- Assert on real values, not "did not throw".
- Test failures and limits too: your error codes, a refused input, a retry.
- Don't skip, loosen, or retry a failing test until it passes: fix the cause.

## Next

- [jobs.md](jobs.md)
- [preview-and-hot-reload.md](preview-and-hot-reload.md)
- [errors.md](errors.md)
