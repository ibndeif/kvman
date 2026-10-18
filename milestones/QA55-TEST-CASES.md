# QA 55 — The cost and reliability review, and each model's thinking levels (ADR 0087)

**Asked.** The product owner asked for a review of kvcoder for context caching, cost, reliability, and how it talks to
the person, and chose to fix all its findings but one (helpers keep the chat's model). The owner added one: the thinking
picker doesn't show a model's own levels (`gpt-6-luna` has `xhigh`).

**The owner chose:** a result for every call of an ended turn; a forced summary and one more call on
`kvai/CONTEXT_TOO_LONG`; retries after 1, 4, 15, and 60 s with a reason and a wait; `cacheRetention: 'long'` for the
lead; `artifact edit` in the connector's entry; briefs that quote; helpers that reuse their parent's checks; each
model's thinking levels, moved to the nearest one when a model lacks the chosen one, and a greyed picker at Off for a
model that doesn't think.

Paths are under `extensions/`.

## Happy path

- **QA55-H1 a stopped turn stores its calls' results.** *Given* a step whose reply made an `fs read` that ran and a
  `shell exec` with `risky: true` waiting for approval, *when* the person stops the turn, *then* the chat holds a tool
  result for both calls in the model's order: the read's own text, and
  `not run: the person stopped the turn` with `isError: true`, and the next step sends no `No result provided`.
  `kvcoder/test/ended-turn-results.test.ts`
- **QA55-H2 a call that was running when the turn stopped is marked unknown.** *Given* a reply whose `delegate run`
  waits on a helper, *when* the person stops the turn, *then* that call's result is
  `stopped while it ran (the person stopped the turn): what it changed is unknown, so check before you run it again`.
  `kvcoder/test/ended-turn-results.test.ts`
- **QA55-H3 a too-long conversation is summarized and sent again.** *Given* a chat with enough older messages, *when*
  the model call fails `kvai/CONTEXT_TOO_LONG` once, *then* a summary is stored, the model is called once more, and the
  turn ends `done` with no `STEP_FAILED` notice. `kvcoder/test/context-overflow.test.ts`
- **QA55-H4 an image counts in compaction's size.** *Given* a user message with two images, *then* its counted
  characters are its text's plus 12,800. `kvcoder/test/sent-size.test.ts`
- **QA55-H5 a failed call is tried five times.** *Given* a model that fails `kvai/RATE_LIMITED` four times and then
  answers, *when* a step runs, *then* it waits 1 s, 4 s, 15 s, and 60 s, sends four `retry` chunks
  `{ attempt: 2..5, of: 5, waitMs, reason: 'rateLimited' }`, and the turn ends `done`. `kvcoder/test/model-retry.test.ts`
- **QA55-H6 the lead asks for the long cache.** *When* a chat's step and its summary call the model, *then*
  `kvai.complete` gets `cacheRetention: 'long'`; a helper's step and a title get none.
  `kvcoder/test/cache-retention.test.ts`
- **QA55-H7 kvai passes the cache retention to pi-ai.** *When* `kvai.complete` is called with
  `cacheRetention: 'long'`, *then* pi-ai's options hold `cacheRetention: 'long'`; left out, they hold none.
  `kvai/test/cache-retention.test.ts`
- **QA55-H8 the artifact entry and the brief rule.** *Then* the lead's prompt holds
  `To change part of an existing artifact, use edit; write it again only when most of it changes.` and
  `put in the brief the paths, the exact lines it needs quoted when they are short, and what you already found, so it
  doesn't read again what you hold.` `kvcoder/test/prompt-review.test.ts`
- **QA55-H9 the retry line says why and when.** *Given* a `retry` chunk `{ attempt: 3, of: 5, waitMs: 15000,
  reason: 'rateLimited' }`, *then* the activity line reads
  `Retrying in 15 s: the provider is limiting calls (3 of 5)`; with `reason: 'unavailable'` it reads
  `Retrying in 15 s: the provider didn't answer (3 of 5)`. `kvcoder/test/web/live-step.test.ts`
- **QA55-H10 a helper reuses its parent's checks.** *Given* a chat whose checks hold a binary connector's and a program
  worker's result, *when* it delegates to a subagent worker, *then* the helper's checks are the binary connector's
  alone and no check program runs at the helper's first step. `kvcoder/test/helper-checks.test.ts`
- **QA55-H11 kvai lists each model's levels.** *Then* `kvai.model.list` gives `gpt-6-luna` on `openai-codex` the levels
  `off, minimal, low, medium, high, xhigh, max`, on `openai` the levels `off, low, medium, high, xhigh, max`, a custom
  reasoning model `off` to `high`, and a custom model that doesn't reason `off` alone.
  `kvai/test/thinking-levels.test.ts`
- **QA55-H12 xhigh is a level.** *When* a session is configured with `thinking: 'xhigh'` on a model that has it,
  *then* the session keeps `xhigh` and its step sends `thinking: 'xhigh'`. `kvcoder/test/thinking-levels.test.ts`
- **QA55-H13 the picker shows the model's levels.** *Given* a chat on a model with `off` to `max`, *then* the thinking
  picker lists seven levels, `Extra high` and `Max` among them; on a model with `off` alone it is disabled and shows
  `Off`. `kvcoder/test/web/thinking-picker.test.ts`

## Edge cases

- **QA55-E1 a turn that fails while calls are held.** *Given* a reply whose first call ran and whose second waits on a
  helper, *when* the helper's step is interrupted (kvman stops), *then* the parent's turn ends `interrupted`, the first
  call keeps its own result, and the second's says `(kvman stopped)`. `kvcoder/test/ended-turn-results.test.ts`
- **QA55-E2 a held-back call is not run.** *Given* a reply whose `fs write` is held behind an approval, *when* the
  person stops the turn, *then* the write's result is `not run: the person stopped the turn` and the file isn't written.
  `kvcoder/test/ended-turn-results.test.ts`
- **QA55-E3 a turn with no calls ends as before.** *Given* a step that fails at its model call, *then* the turn ends
  `failed` with `STEP_FAILED` and no tool result is added. `kvcoder/test/ended-turn-results.test.ts`
- **QA55-E4 calls that already have results get none twice.** *Given* a reply whose results were all stored, *when*
  the turn ends, *then* no other tool result is added. `kvcoder/test/ended-turn-results.test.ts`
- **QA55-E5 too long twice ends the turn.** *When* the model call fails `kvai/CONTEXT_TOO_LONG` again after the summary,
  *then* the turn ends `failed` with `STEP_FAILED` and `kvai/CONTEXT_TOO_LONG`, and the model was called twice.
  `kvcoder/test/context-overflow.test.ts`
- **QA55-E6 too long with nothing to summarize.** *Given* a chat whose older messages are under the minimum, *when* the
  call fails `kvai/CONTEXT_TOO_LONG`, *then* no summary is stored, the model isn't called again, and the turn ends
  `failed` with `STEP_FAILED`. `kvcoder/test/context-overflow.test.ts`
- **QA55-E7 a model whose window is unknown is summarized on overflow.** *Given* a session created with no model, which
  calls `kvai.defaultModel` and so is never compacted by size, *when* its call fails `kvai/CONTEXT_TOO_LONG`, *then* the
  forced summary runs and the model is called again. `kvcoder/test/context-overflow.test.ts`
- **QA55-E8 five failures end the turn.** *Given* a model that fails `kvai/PROVIDER_ERROR` with `transient: true` five
  times, *then* the turn ends `failed` with `STEP_FAILED`, and the four chunks carry `reason: 'unavailable'`.
  `kvcoder/test/model-retry.test.ts`
- **QA55-E9 a stop during a 60 s wait.** *When* the person stops the turn during the last wait, *then* the turn ends
  `cancelled` at once and no fifth call is made. `kvcoder/test/model-retry.test.ts`
- **QA55-E10 kvai refuses an unknown retention.** *When* `kvai.complete` gets `cacheRetention: 'forever'`, *then* it
  fails `VALIDATION_FAILED`. `kvai/test/cache-retention.test.ts`
- **QA55-E11 a model switch moves the level.** *Given* a session at `minimal`, *when* it is configured with
  `openai/gpt-6-luna` (no `minimal`), *then* its level is `low`; *given* a session at `xhigh`, *when* it is configured
  with a custom reasoning model, *then* its level is `high`; *given* one at `medium`, a model that doesn't reason moves
  it to `off`. `kvcoder/test/thinking-levels.test.ts`
- **QA55-E12 a level the model lacks, set by hand.** *When* `kvcoder.session.configure` sets `thinking: 'max'` on a
  model whose top level is `high`, *then* the session's level is `high`. `kvcoder/test/thinking-levels.test.ts`
- **QA55-E13 a new session and a helper start on a level their model has.** *Given* `kvcoder.thinking` `xhigh` and a
  default model whose top level is `high`, *then* a new session starts at `high`; a helper whose worker names a model
  without the chat's level starts at the nearest one. `kvcoder/test/thinking-levels.test.ts`
- **QA55-E14 an unlisted model leaves the level.** *When* a session is configured with a model kvai doesn't list,
  *then* its level stays as it was. `kvcoder/test/thinking-levels.test.ts`
- **QA55-E15 the worker form's levels.** *Then* a worker that uses the chat's model lists all seven levels, and one
  whose model has `off` to `high` lists five. `kvcoder/test/web/thinking-picker.test.ts`
- **QA55-E16 a helper of a parent with no checks.** *Given* a parent whose checks are not yet run, *then* the helper
  runs the binary connectors' checks at its first step and never a program worker's. `kvcoder/test/helper-checks.test.ts`
- **QA55-E17 Arabic labels.** *Then* `kvcoder.ui.thinkingLevels.xhigh` and `.max` are `مرتفع جدًا` and `أقصى`, and both
  retry lines have Arabic. `kvcoder/test/locales.test.ts`
