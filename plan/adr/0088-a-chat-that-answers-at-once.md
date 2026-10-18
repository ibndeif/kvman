# ADR 0088 — a chat that answers at once: rows-only job lists, the least-busy worker, and declared indexes

Status: accepted by the product owner on 2026-10-18. Decision 1 landed first (commit 5678b05), since it changes no
behavior; the plan text below came before the code of decisions 2 to 4. It amends plan 02 §2.2, §2.5, and §2.9;
plan 08 §8.4; and plan 12 §12.3.

## Context

The owner reported that kvcoder became slow to react: a sent message or an answered question took seconds to show. On
the owner's desktop kvman, one worker thread had used 100% of a core for 30 minutes, ten of them with no turn running,
while the other 15 workers were idle. The same home, copied and opened in a headless browser with its busiest chat
(2,855 messages; 6,006 in the workspace, 32 MB) idle on screen, reproduced it: one worker at 72%.

- **`kvcoder.job.list` took 1.7 s.** For every subagent the chat had started, it read the helper's progress and result
  (three scans of the workspace's messages each), then kept only the row. Since ADR 0085, 1 the chat reads the list on
  every reload, every 5 s and after every stream event, besides the Running chip's own reads: more work than a worker
  can do, so the queue never emptied.
- **Every job lands on the first worker.** The pool fills a worker up to `kernel.workerConcurrency` (32) before it
  gives the next one a job, so the person's `message.send`, the polls, and the turn share one event loop. A no-op
  `kernel.health.get` waited 673 ms, `kvai.provider.list` 3.5 s; `message.send` itself takes 26 ms.
- **Every lookup reads the whole collection.** `store_documents` has only its primary key, so a `find` or `count` by
  `sessionId` evaluates `json_extract` on every document of the workspace's collection: about 60 ms for the messages
  above, growing with every chat the workspace ever held. `kvcoder.message.list` takes 141 ms to return 5 KB.

## Decisions

1. **A job list reads rows only.** `kvcoder.job.list`, the `background list` connector, and the running jobs the lead
   is told of build each row from the job's records; a helper's messages, result, and progress, and a process's log,
   are read only for one job (`kvcoder.job.get`, `background read`). Its answer is unchanged (byte-identical on the
   owner's three busiest chats); 1.7 s became 18 ms.
2. **A job goes to the least-busy worker** (asked; recommended). Each job that starts goes to the worker running the
   fewest jobs, the earliest started on a tie, still at most `kernel.workerConcurrency` per worker. A job that hogs the
   CPU then slows only its own worker, as §2.2 says.
3. **Collections declare indexes in the manifest** (asked; recommended: ordered field lists, built at start).
   - `kvman.indexes` maps a collection name to a list of indexes; an index is a list of distinct top-level field names
     (`"messages": [["sessionId"], ["sessionId", "block"]]`). An index serves the collection in every scope, the
     workspace's and `global`. An invalid entry, an empty index, or a field repeated in one index fails the manifest
     (`EXTENSION_INVALID`).
   - At start, before the workers, and after a reload, the kernel keeps exactly the indexes the run's extensions
     declare: it creates the missing ones and drops its other store indexes. Data is never touched. The SQLite index
     holds each field's JSON type and value, so a match needs no document parse; its name is private.
   - A `find` or `count` uses the declared index whose fields are exactly the filter's (in any order); otherwise the
     one with the most leading fields that are all in the filter; otherwise none. Results, their order, and their
     errors are the same with or without an index.
   - Measured on the owner's data: a `find` whose filter is an index's fields went from about 60 ms to under 0.3 ms.
     A `count` still visits each matching document (SQLite looks the row up for an expression index of a
     `WITHOUT ROWID` table), so counting a chat's 2,855 messages went from 58 to about 54 ms; a filter that matches
     only an index's leading fields sorts its matches by id.
   - kvcoder declares the field sets it filters its growing collections by (plan 08 §8.4).
4. **A benchmark guards the job list** (asked; recommended). `kvcoder.job.list` for a chat with 20 ended helpers, in a
   workspace with 5,000 messages, has the target p50 ≤ 50 ms (plan 12 §12.3).

## Consequences

- The owner's busiest chat, idle on screen, used 5% of a worker after decision 1 (72% before); decisions 2 and 3 keep
  the person's commands from waiting behind polls and turn steps, and keep lookups from growing with old chats.
- Each declared index costs a little on every write to its collection, and disk space; an extension declares only
  the field sets it filters by.
