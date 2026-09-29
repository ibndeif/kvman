# ADR 0165 — The test kernel: runtime, extensions, senders, modes, and API

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.13
- **Decided by**: the product owner

## Question

`05` §5.10 describes `createTestKernel` as "the real kernel with in-memory SQLite and a synchronous host", taking definition objects (`extensions: [pdf, fakeProvider(…)]`). The kernel built in M1–M2.12 disagrees:

- it never runs extension code on its main thread;
- shared hosts are worker threads that read the database file through their own read-only connection;
- sandboxed hosts are processes that load the extension from files.

The plan also leaves open:

- how the sender of `k.command(...)` ("a test extension") is chosen, and what it may call;
- how "the same tests run against `sandboxed` isolation in CI" is selected (ADR 0007: CI means the local gates);
- how shared mode runs an extension that requests no isolation, since ADR 0128 refuses a grant below the requested level;
- the shapes of the test kernel's calls.

## Options

- **Runtime:**
  1. **A temporary home with real hosts.**
  2. In-memory SQLite and a new in-thread host.
  3. A child-process daemon driven over HTTP.
- **Extensions:**
  1. **Entry module URLs; fakes as data.**
  2. Package folders, staged like `kvman ext dev`.
  3. Definition objects (in-thread host only).
- **`k.command` sender:**
  1. **A testkit driver extension with `calls` for the extensions under test.**
  2. The extension under test itself.
  3. A sender chosen per call.
- **Mode selection:**
  1. **An environment variable; the gates run both modes.**
  2. A `createTestKernel` option only.
- **Shared mode:**
  1. **Install the extension as a builtin.**
  2. Enable each extension at its requested level only.
- **API:**
  1. **Values returned, problems thrown; recorders read what committed.**
  2. `ReplyPayload`s returned.

## Decision

Option 1 in each case.

**Runtime**

- `createTestKernel` runs the real `KernelRuntime` on a temporary home folder (a SQLite file in WAL mode), with:
  - no builtin tarballs;
  - a registry that nothing listens on;
  - the kernel's log records kept in memory.
- `k.close()` waits until no message is due or running (as `k.idle()` does), so the work a test started, such as a subscription, ends and its checks run. It then stops the runtime and deletes the home.
- Extension code runs in the normal hosts: a worker thread in shared mode, a sandboxed process in sandboxed mode.
- The kernel's clock is the real clock.

**Extensions**

- A test names each extension by its entry module: `extensions: [new URL('../src/extension.ts', import.meta.url)]`.
- The testkit imports the module in the test process and records it (`recordExtension`, which runs `setup` twice and compares the results).
- It places the entry's folder and everything under it as the extension's snapshot, the way fixture installs do (ADR 0114):
  - TypeScript types are stripped;
  - relative `.ts` imports become `.js`;
  - the recorded manifest is stored with the version rows.
- Imports from outside that folder resolve only for the kvman packages the hosts already provide (`@kvman/sdk`, `@kvman/protocol`, and `zod` through the SDK).
- `fakeProvider(options)` returns a descriptor, not a definition. The testkit places it as a generated entry that builds the fake with those options, as M2.9's harness does (ADR 0154). The failure count is kept per loaded instance.

**The driver and the person**

- Every test kernel installs its own extension `@kvman/testkit-driver` (namespace `testkit`):
  - it has no handlers;
  - it requests `calls` for `<ns>.*` of each extension under test, and nothing else.
- `k.command` and `k.query` send as `ext:@kvman/testkit-driver`, so:
  - `all` and `extensions` types of the extensions under test are admitted;
  - `user` and `internal` types fail `CAPABILITY_DENIED`, because a `calls` pattern never covers another extension's `user` or `internal` type (`05` §5.7) and the kernel checks `calls` before `access`;
  - types its `calls` don't cover fail `CAPABILITY_DENIED` too.
- `k.asUser({ locale? })` sends as `user:local`.
  - The kernel sets a message's locale from the saved preference at admission (ADR 0161). So when `locale` is given and differs from the saved one, `asUser` first sends `kernel.user.preferences.set { locale }` as the person, as a language switch in the shell would.
  - The language stays saved for later calls.

**Workspace and enabling**

- The test kernel opens one workspace: `workspace` (a folder path) or a new temporary folder. It is opened with `kernel.workspace.open` as the person.
- Every extension, the driver included, is enabled there with `kernel.extension.enable` as the person. The grant is exactly what the extension requests and derives, at the mode's isolation.

**Modes**

- `isolation` is `createTestKernel({ isolation })`, else `KVMAN_TESTKIT_ISOLATION` (`shared` or `sandboxed`), else `shared`.
- Shared mode installs each extension with source `builtin:<name>`, so it runs shared as the core extensions do (`05` §5.7). No grant rule changes.
- Sandboxed mode installs it with source `local:<digest>` and grants `sandboxed`, whatever it requests.
- `pnpm test` runs every `createTestKernel` suite once in each mode.

**API**

```ts
const k = await createTestKernel({
  extensions: Array<URL | FakeProvider>,
  workspace?: string,                      // default: a new temporary folder
  isolation?: 'shared' | 'sandboxed',      // default: KVMAN_TESTKIT_ISOLATION, else 'shared'
  processes?: Record<string, { stdout?: string[]; stderr?: string[]; exitCode?: number }>,   // ADR 0166
});
k.asUser({ locale? }).command(type, payload) → Promise<Json>   // the reply's value
k.asUser({ locale? }).query(type, payload)   → Promise<Json>
k.command(type, payload) / k.query(type, payload)             // as the driver
k.events(type?)  → Array<{ type, payload, workspaceId? }>
k.ui(type?)      → Array<{ type: 'ui.toast' | 'ui.notify' | 'ui.dismiss' | 'ui.navigate', payload, workspaceId? }>
k.blobs.put(bytes, { mime }) → Promise<{ blobId, size, mime }>
k.crashDuring(type, point, payload?) → Promise<Json>          // ADR 0166
k.idle()   → Promise<void>
k.close()  → Promise<void>
```

- A problem reply is thrown as a `TestkitProblem` error whose `problem` is the `Problem`.
- `k.events` lists the committed durable and transient events, oldest first, the kernel's included.
- `k.ui` lists the admitted `ui.*` sends (the `done` rows of ADR 0162), oldest first.
- `k.blobs.put` stores an upload reference as `PUT /blobs` does, for the test workspace.
- `k.idle()` resolves once no message is pending and due, or running. Deferred commands waiting for a reply, and delayed messages whose time has not come, don't count.
- Every call sends in the test workspace.
- Commands wait for their reply.

## Consequences

- `@kvman/testkit` exports `createTestKernel`, `TestKernel`, `TestkitProblem`, and `fakeProvider` (now a descriptor), with a changeset.
- `KernelRuntime` takes the sandboxed-host starter as an optional dependency, as it already takes the worker starter.
- `05` §5.10 and ADR 0154's last sentence are corrected.
