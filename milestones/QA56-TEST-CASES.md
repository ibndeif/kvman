# QA 56 — A chat that answers at once (ADR 0088)

**Asked.** The product owner reported that kvcoder reacted slowly to a sent message or an answered question, and asked
for the root cause to be found and fixed. One worker was at 100% CPU with no turn running: `kvcoder.job.list` took
1.7 s and the chat read it on every reload, every job went to the first worker, and every store lookup read the whole
collection.

**The owner chose:** job lists that read rows only (no behavior change, landed first); each job on the worker running
the fewest jobs; indexes as ordered field lists declared in the manifest's `kvman.indexes`, built at start; and a
benchmark for the job list.

Paths are relative to the repository root.

## Happy path

- **QA56-H1 a job list reads rows only.** *Given* a chat with an ended background helper that wrote messages, *when*
  the person lists the chat's jobs, *then* the helper's row is the row `kvcoder.job.get` returns for it, without
  `output` or `progress`, and `kvcoder.job.get` still returns both. `extensions/kvcoder/test/job-api.test.ts`
- **QA56-H2 a job goes to the least-busy worker.** *Given* `kernel.workers: 2` and a job held at a gate, *when* another
  job runs, *then* it runs on the other worker's thread. `packages/testkit/test/jobs/worker-placement.test.ts`
- **QA56-H3 a tie goes to the earliest started worker.** *Given* `kernel.workers: 2` and no running job, *when* two jobs
  run one after the other, *then* both run on the same thread. `packages/testkit/test/jobs/worker-placement.test.ts`
- **QA56-H4 declared indexes exist after start.** *Given* an extension whose manifest declares
  `{ "notes": [["owner"], ["owner", "tag"]] }`, *when* kvman starts, *then* the database has exactly two store indexes,
  and each holds the fields' JSON types and values. `packages/kernel/test/store/indexes.test.ts`
- **QA56-H5 a lookup uses the index whose fields are the filter's.** *Given* indexes `[owner]` and `[owner, tag]`,
  *then* a filter on `{ tag, owner }` picks `[owner, tag]`, `{ owner }` picks `[owner]`, `{ owner, size }` picks
  `[owner]`, and `{ tag }` picks none. `packages/kernel/test/store/indexes.test.ts`
- **QA56-H6 an index changes no result.** *Given* the same documents in a collection with indexes and one without,
  *when* both run the same `find` (asc, desc, with `after`, with a limit) and `count` calls, *then* every answer is
  equal. `packages/kernel/test/store/indexes.test.ts`
- **QA56-H7 kvman keeps exactly the declared indexes.** *Given* a database with a store index no extension declares and
  a kernel index of its own tables, *when* the indexes are kept for a run, *then* the undeclared store index is dropped,
  the kernel's index stays, and no document changes. `packages/kernel/test/store/indexes.test.ts`
- **QA56-H8 a reload builds a new extension's indexes.** *Given* a running `path:` extension, *when* its manifest gains
  an index and it reloads, *then* the index exists and the reloaded code's finds return as before; an index it no longer
  declares is dropped once the old workers have stopped. `packages/testkit/test/reload/reload-indexes.test.ts`
- **QA56-H9 kvcoder declares its indexes.** *Then* kvcoder's manifest declares exactly the field sets plan 08 §8.4
  lists. `extensions/kvcoder/test/manifest-indexes.test.ts`
- **QA56-H10 the job list benchmark.** *Given* a chat with 20 ended helpers in a workspace of 5,000 messages, *then*
  `kvcoder.job.list` meets p50 ≤ 50 ms. `bench/kvcoder-job-list.ts`

## Edge cases

- **QA56-E1 an invalid index declaration fails the manifest.** An empty list for a collection, an empty index, an
  empty field name, a field repeated in one index, or a non-string field fails `kvmanFieldSchema`, and so the start,
  with `EXTENSION_INVALID`. `packages/sdk/test/manifest.test.ts`
- **QA56-E2 matches through an index keep JSON types.** Through an index, `{ n: 1 }` does not match `true`, `{ s: '5' }`
  does not match `5`, `{ o: '{"a":1}' }` does not match an object, and `{ x: null }` matches `null` but not a missing
  field. `packages/kernel/test/store/indexes.test.ts`
- **QA56-E3 a filter on an index's leading fields returns id order.** With only `[owner, tag]` declared, `find({ owner })`
  returns ids ascending, and descending with `order: 'desc'`, from an `after` position too.
  `packages/kernel/test/store/indexes.test.ts`
- **QA56-E4 quotes in names are safe.** An extension, a collection, and a field whose names hold `'` and `"` are
  indexed, found, and counted correctly. `packages/kernel/test/store/indexes.test.ts`
- **QA56-E5 an index serves every scope.** A collection's index finds documents in a workspace scope and in `global`,
  and never another extension's documents of the same collection name. `packages/kernel/test/store/indexes.test.ts`
- **QA56-E6 placement never exceeds the concurrency.** *Given* `kernel.workers: 2` and `kernel.workerConcurrency: 1`,
  with a job held on each worker, *then* a third job waits until one ends, and then runs on the freed worker.
  `packages/testkit/test/jobs/worker-placement.test.ts`
