# ADR 0108 — workers in the background, focused briefs, and a lighter history

Status: accepted by the product owner on 2026-10-29 (six rounds of questions after a review of kvcoder's speed,
delegation, chat, focus, and help calls; every answer is below), and the details under "Details", written while
specifying them, accepted as written ("accept"). It amends plan 08 §8.1, §8.2, §8.3, §8.5, and §8.7,
and ADRs 0021, 0034, 0037, 0068, 0075, 0085, 0094, 0102 (6 and 11), and 0103 (6).

## Context

A review of the owner's chats from 2026-10-20 to 2026-10-28 (`~/.kvman/kvman.db`, read only; mostly one long chat
on the research app, gpt-6.1-sol for the lead and gpt-6-luna for helpers, through the ChatGPT sign-in) found:

- **The lead waits on its workers.** Of the lead's wall time, 14.2 h went to foreground `delegate run` calls (36 runs,
  median 7.5 min) and 7.7 h to `background wait` (172 calls, median 120 s, the default). While a foreground helper
  runs, a message from the person is queued until the helper ends, and Stop cancels the helper: 7 of the owner's 22
  "Continue." messages came after a Stop pressed to ask "why it takes so long?". All 76 delegations were one worker
  at a time.
- **Workers think long and start cold.** The owner's saved workers ran at `xhigh` and `max`: a helper step took a
  median of 15.8 s and 526 output tokens at `xhigh`, 5.1 s and 54 at `medium`. 98% of a helper's active time is the
  model's. A worker spends a median of 9 steps reading before its first edit, and 71% of its calls read or search.
  Briefs (median 1,745 characters) hold a median of 4 different actions, up to 9, in compressed text.
- **The history stays large.** A step sends a median of about 99K tokens (5–6K of system prompt). Clearing old
  results lowers a lead's prompt from a median of 136K to 95K tokens, since calls, text, and thinking stay, so it
  comes again every 44 steps, each time a full cache miss. In a 151K-token step, the agent's own call arguments were
  34%, results 26%, its text and thinking 18%; 986 messages from 2.5 days of unrelated work.
- **The cache.** 93.6% of prompt tokens were read from the cache. Of the 37.5M uncached tokens, clearing caused 25%,
  and 27% came from 124 steps (about 2%) whose prompt kvman had not changed. The ChatGPT sign-in route sends
  `prompt_cache_key` but no retention, so `cacheRetention: 'long'` has no effect there. A loaded `AGENTS.md` that
  the agent edits changes the system prompt, a full miss.
- **Waste.** The rule files load from the workspace root only: the research workspace's `research/AGENTS.md` was
  read 248 times by hand, and its `Testing:` line never reached the prompt. 63% of background "finished" messages
  repeat what `background wait` or `output` already returned. 46 of 82 `mcp tools` calls looked up a tool the chat
  had already looked up, and each `mcp run` starts a new browser.
- **Turns that stop.** 8 "Continue." messages followed a connection, OAuth refresh, or usage-limit failure (about 80 s
  of retries today), and 7 an ending while the agent waited on a background process, whose end starts no turn.
  "Run the app so I can test it" took a median of 7 steps and 94 s; once, 3 extra minutes of browser checks. One turn
  ran 534 steps. 82% of replies make one call.
- **The chat.** Workers never write text beside their calls (0 of 1,756 replies), so a helper's card shows a title and
  a spinner, though 84% of those replies carry a thinking headline. Help, tool lookups, background checks, and map
  reads show as cards. `artifact write` failed at the 20-artifact limit while showing the running app.

## Decision

1. **Every delegation runs in the background** (asked; recommended over a foreground wait that a message can
   interrupt). `delegate run` and `delegate continue` have no `background` field; both return at once `started <id>`
   with the line `(helper <id>)`, and the turn goes on. The helper's answer arrives as the background message it is
   today, which starts a turn when the chat is idle (§8.1). A program worker's run is the same: `started <runId>`,
   after its approval when it asks. No new pending call of kind `subagent` or `worker` is made; one saved before this
   ADR settles as before. The person's Stop ends the lead's turn and leaves its helpers running, as background runs
   are left today; each one is stopped from the Running popover. A helper's questions and approvals show as a
   background helper's do (ADR 0085, 1). The lead's method says: after starting workers, go on with what doesn't need
   them or end the turn; their answers wake it; never `background wait` on a helper.
2. **A brief is one deliverable, structured and enforced** (asked; recommended over the same shape in the prompt only,
   and over four built-in workers). `delegate run { worker, title, kind, goal, done, files?, context?, budget? }`:
   - `kind`: `find` (locate or explain code or facts), `change` (make one change), `check` (run commands or tests and
     diagnose them), or `review` (review a finished change).
   - `goal`: one sentence of what the run delivers; `done`: one condition that can be checked.
   - `files`: the paths a `change` run may change, required for `change` and refused for the other kinds.
   - `context`: line ranges `{ path, fromLine?, lines? }` whose current text kvcoder reads at the start and attaches
     to the brief, up to 20 KB in all (asked; recommended over 10 and 40 KB); a range past the limit is named, not
     attached.
   - `budget`: the most steps the run takes, 60 (asked: 60; recommended was 40). At the budget the helper's turn ends
     as a step limit does, and its result is the unfinished one of §8.5 with its last message.
   - The helper's first message is written by kvcoder from these fields. `find` and `review` run read-only, as a
     `readOnly` worker's helper does (ADR 0056); `check` may also run `shell exec` and a binary's `exec`, with their
     approval as usual, but makes no `fs` change (asked while building, since a read-only helper runs no line;
     recommended over a read-only `check` and over dropping it); a `change` run's `fs` changes to a path outside
     `files` are refused before any approval. A `readOnly` worker refuses `kind: 'change'`. A `shell exec` is not limited to
     `files`; the brief says so. A program worker gets the same text as its task, and nothing is enforced.
3. **A worker's thinking has a ceiling** (asked; recommended). The setting `kvcoder.delegate.thinkingLimit`, `high` by
   default, caps every helper's level (the worker's, the helpers' default, or the chat's), before the nearest level
   its model has is taken. The owner's saved workers are changed with them: `general` and `tester` to `medium`,
   `ui-ux` and `reviewer` to `high`.
4. **Delegate only when it pays** (asked; recommended over read-only workers only, and over today's guidance). The
   lead delegates `find`, `check`, and `review` runs, and `change` runs only when two or more run in parallel on
   `files` that don't overlap; never a question, a small change, work it already holds the context for, or work the
   person asked it to do itself.
5. **One deep trim of the history** (asked; recommended over collapsing at every turn's end and over tuning today's
   clearing), **at 60,000 tokens** (asked; recommended over 40K and 80K). At the start of a step, when the prompt
   passes 60,000 tokens (half the model's window when that is less), or at a turn's first step when the chat's last
   model call is over an hour old, kvcoder trims in one transaction: finished turns are sent collapsed, results are
   cleared as today (over the results older than the newest 24,000 tokens), and the reasoning of collapsed turns is
   dropped (asked; recommended over keeping the latest turn's or all of it). A collapsed turn is sent as the person's
   messages of that turn, then one assistant message with its final answer and the line `[kvman: files changed in
   this turn: <paths>]` when it changed any. The stored messages and the conversation don't change. Summaries at
   `kvcoder.compactAt` stay as the safety net, and a step that trimmed doesn't summarize. This trigger replaces
   clearing's 80,000-token one (amends ADR 0094, 1 and ADR 0102, 6).
6. **Rule files from the root and one level down, kept for the chat** (asked; recommended over the nearest file to
   what is touched). At a chat's first step kvcoder reads `AGENTS.md` and `CLAUDE.md` in the workspace folder and in
   each folder directly inside it, and keeps that text as the chat's prompt sections for its life. When a kept file's
   text later differs, the next step sends one message that it changed, with its current text; the system prompt
   doesn't change. A helper keeps its parent's text.
7. **Trims that change nothing sent** (asked: all three).
   - A background message whose run's ended result `background wait` already returned is not appended, and one
     already queued is dropped. Not after `background output` (asked while building; recommended over making it a
     command): it is a query, which writes nothing, and read-only helpers run it.
   - `fs read`'s unchanged answer (ADR 0034, 7; ADR 0097, 3) stays as it is, counting only results sent in full: it
     already does what was asked, and most re-reads followed a clear.
   - `mcp tools` results are never cleared or collapsed, so a server's tools are looked up once a chat.
8. **Each reply records what it was sent** (asked; recommended over a log line and over nothing): a hash of the
   system prompt and tools, a hash of the messages, their count, and whether the messages start with the previous
   call's messages unchanged; nothing of their content.
9. **Two new rules in the lead's method** (asked: these two of four; "Tests in the foreground" and "Check claims in
   the code" were not chosen). "When the person says they will test it themselves, start it, request its address
   once, give it to them, and stop: no browser checks." and "Never spend a reply only on `execution-map update`: send
   it in the reply that makes the next piece of work's calls."
10. **A map for large work, deliberating when asked** (asked; recommended). The map keeps its rule (several parts that
    depend on each other, or hard to undo), and a fix the person described never gets one. Deliberating with the
    council runs only when the person asks for it (amends ADR 0103, 6).
11. **A check-in on long turns** (asked; recommended over 100 steps and a hard stop at 200). At step 60 of a turn,
    and every 60 after, kvcoder adds the message `[kvman: step <n> of this turn. Say in one line where you are and
    what is left, then go on.]`; nothing stops.
12. **One MCP session per turn** (asked; recommended over one per chat and over today's one per call; then, since a
    job can't carry a command's standard input and output to the next job, asked again while building: keep-running
    HTTP servers, recommended over dropping it and over new kernel piping). A server over HTTP keeps its MCP session
    for the turn; a command server with a new optional `port` is started once per turn through `ctx.processes` as an
    HTTP server on that port, and the turn's calls share its session, so a page stays open across the turn's steps.
    A command server without `port` connects per call as before. The turn's end stops what it kept.
13. **Housekeeping calls are not shown** (asked: all four). The conversation shows no card, and a fold counts nothing,
    for `help`, `mcp tools`, `background list`, `output`, and `wait`, and `execution-map get` and `update`. They stay
    in the history and the export.
14. **Payloads without a help call** (asked; recommended). The connector index gives a registered connector's
    commands one line each with its payload's signature, as kvcoder's own have, and an invalid payload's error ends
    with that command's help.
15. **Network failures pause the turn** (asked; recommended). A step's model call that fails `kvai/PROVIDER_ERROR`
    with `transient: true` or `kvai/RATE_LIMITED` is tried for up to 10 minutes, with growing waits; still failing,
    the turn waits with the notice `CONNECTION_WAITING`, and a schedule tries again every 2 minutes for up to an hour,
    then resumes the turn itself or ends it as today. A usage limit moves to the fallback model as today.
16. **`notify` on a background line** (asked; recommended). `shell exec` and a binary's `exec` with `background: true`
    take `notify?: true`: when that run ends while the chat is idle, its background message starts a turn. A run
    without it never does.
17. **A worker's card says where it is** (asked; recommended). While it runs: its newest thinking headline, `step <n>
    of <budget>`, its time so far, and its last action as its call's closed line says it.
18. **The artifact limit reuses ended pages** (asked; recommended). At 20 artifacts, writing a new `url` artifact
    replaces the oldest `url` artifact whose server has stopped; with none, the call fails as today.
19. **`run` takes several calls** (asked: keep `run` and allow batch calls; then the `calls` list, recommended over a
    second tool and over the prompt only). `run` takes `{ connector, command, payload? }` or `{ calls: [{ connector,
    command, payload? }] }` with 1 to 20 calls. The reply is stored with the list as that many `run` calls (ids
    `<id>-1`, `<id>-2`, …), so each has ADR 0046's ordering, its own card, approval, and result, as several calls of
    one reply do (asked while building; recommended over one combined result, which would need new handling of
    approvals and held-back calls inside a batch).

## Details

Written while specifying the decisions above and accepted by the owner.

- D2: `goal` and `done` are 1 to 300 characters; `files` 1 to 50 workspace paths, no globs; `context` 1 to 20
  ranges; `budget` 1 to 60, 60 when left out; a continued helper gets its run's budget again for each turn.
- D5: kept whole are the current turn, the newest ended turn, and every ended turn after the newest `done` one, so a
  "Continue." chain stays whole; the session gains `collapsedThroughSeq` (`null` in old records).
- D5: a collapsed turn's background and job messages are dropped with its calls.
- D5 (written while building): a trim at 60,000 tokens also needs to take out more than 20,000 tokens, as clearing
  did, so a long single turn isn't trimmed again at every step; a collapsed turn names its files relative to the
  workspace folder.
- D6: folders whose names start with a dot and `node_modules` are skipped; each file keeps today's 32 KB; the kept
  text is stored on the session as `rules: [{ path, content, told }]`, `told` the SHA-256 of the text last told.
- D8: the assistant message gains `sent: { promptHash, messagesHash, messageCount, prefixKept }`.
- D15 (changed while building): the step's own waits stay 1, 4, 15, and 60 s, and every later try, every 2 minutes,
  is the schedule's, 30 at most, counted on the turn as `connectionWaits`; the test kernel's fake clock drives
  schedules but not the waits inside a job, so ten minutes of waits inside the step couldn't be tested, and the
  cadence is the same. The new notice code is
  `CONNECTION_WAITING { model, code }` (en: "The connection to {model} failed; kvman tries again every 2 minutes."),
  the waiting turn's `waitingOn` is `null`, and a message from the person resumes it at once; the retry is the private
  scheduled command `kvcoder.turn.resume { sessionId, turnId }` with the key `connection-<sessionId>`.
- D11 and D6: the check-in and changed-rules messages are `user` messages with kvcoder as their source, shown in the
  conversation as notes.
- D12: a connection that fails mid-turn is started again at the next call; a server over HTTP keeps its session id
  for the turn.
- D19: a `calls` list with an invalid entry runs none of them and fails `VALIDATION_FAILED` naming the entry.
- D18 (written while building): the result of a write that replaced one adds `"replaced": "<id>"`, and "stopped"
  means nothing accepts a connection at its port within 1 s.
- D6 (written while building): a chat made before ADR 0108 keeps its rule files from its next step.

## Not done

The tests-in-the-foreground and check-claims rules (not chosen); native tools per command (replaced by D19); a cap on
a summary's added facts and merging cleared stubs (not asked).
