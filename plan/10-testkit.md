# 10 — Testkit (`@kvman/testkit`)

The testkit runs a real kernel in-process for tests, with a temporary home and no HTTP. kvman's own tests and extension projects both use it.

```ts
const kernel = await createTestKernel({ extensions: ['./'], settings?: { … }, secrets?: { … } });
await kernel.exec('notes.add', { text: 'hi' });                              // as the user
await kernel.exec('notes.add', { text: 'hi' }, { as: '@acme/notes' });       // as an extension
await kernel.exec('notes.add', { text: 'hi' }, { workspaceId: ws.id });      // in a workspace (default Home)
const jobId = await kernel.execAsync('notes.reindex', {});
const job = await kernel.waitForJob(jobId);
kernel.clock.advance(60_000);                                                // fake clock: the kernel's timers
await kernel.close();
```

- Workers, validation, storage, and every other kernel behavior are real.
- `settings` and `secrets` are set before the extensions load. `settings` are the run's preset settings, and `secrets` is `{ "<extension package>": { "<name>": "<value>" } }` (ADR 0009, 13).
- A test kernel starts one worker unless `settings` set `kernel.workers` (ADR 0009, 10).
- Its Home workspace is a temporary folder of its own, and `close()` removes it with the temporary home (ADR 0009, 11).
- The fake clock drives the kernel's own timers: retries, schedules, retention, and ids. It doesn't change `Date` inside handlers.
- `exec` and `execAsync` take `{ as?, workspaceId? }`.
- It may import `kernel` and `sdk` (§1.4). It is published as `@kvman/testkit` and depends on `@kvman/kernel`.
