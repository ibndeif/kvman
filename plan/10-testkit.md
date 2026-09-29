# 10 — Testkit (`@kvman/testkit`)

The testkit runs a real kernel in-process for tests, with a temporary home and no HTTP. kvman's own tests and extension projects both use it.

```ts
const kernel = await createTestKernel({ extensions: ['./'], settings?: { … }, secrets?: { … } });
await kernel.exec('notes.add', { text: 'hi' });                              // as the user
await kernel.exec('notes.add', { text: 'hi' }, { as: '@acme/notes' });       // as an extension
const jobId = await kernel.execAsync('notes.reindex', {});
const job = await kernel.waitForJob(jobId);
kernel.clock.advance(60_000);                                                // fake clock: schedules, retries
await kernel.close();
```

- Workers, validation, storage, and every other kernel behavior are real.
- `settings` and `secrets` are set before the extensions load.
- It may import `kernel` and `sdk` (§1.4).
