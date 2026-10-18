# ADR 0087 — the cost and reliability review, and each model's thinking levels

Status: accepted by the product owner on 2026-10-18, before source. It amends ADR 0009, 155 and 203; ADR 0012, 6;
ADR 0021, 17 and 37; ADR 0033, 6; ADR 0071, 5; plan 07 §7.1 and §7.2; and plan 08 §8.1, §8.2, §8.5, and §8.7.

## Context

The owner asked for a review of kvcoder: context caching, cost, reliability, and how it talks to the person. The review
read the code and measured the owner's own chats (246 sessions, 5,982 model calls, $119): 94.5% of prompt tokens were
cache reads; the cost was about a third each new input, cache reads, and output; helpers were 30% of it, and 57% of the
files a helper read the lead had read before it handed the task over. It found ten issues; the owner chose to fix all
of them but one (helpers use the chat's model unless the person sets one, which stays). The owner added one: a model's
thinking levels are not shown as the model has them (`gpt-6-luna` has `xhigh`, which no picker offers).

## Decisions

1. **An ended turn stores a result for every call of its last reply.** Stop, a crash, or a failure could end a turn
   while its last reply's calls had results held, waited on the person or a helper, or ran; the held results were then
   dropped and the provider was sent `No result provided`, so the model could not tell a write that happened from one
   that didn't (7 such calls in the owner's chats, one an `fs write`). Now the transaction that ends the turn appends,
   in the model's call order, a tool result for each call of the turn's last reply that has none: a held result as it
   was; a call that never started (a question, an approval, or a call held back behind one) as `not run: <why>`; and a
   call that was running, a helper or a program worker's run among them, as
   `stopped while it ran (<why>): what it changed is unknown, so check before you run it again`. `<why>` is
   `the person stopped the turn`, `kvman stopped`, `the turn failed`, or `the turn reached its step limit`. These are
   errors (`isError: true`).
2. **A conversation too long for the model is summarized once and sent again** (asked; recommended). When a step's
   model call fails `kvai/CONTEXT_TOO_LONG`, the step compacts by force (as `kvcoder.session.compact`, with the same
   minimum) and calls the model once more; a second `CONTEXT_TOO_LONG`, or no summary stored, ends the turn with
   `STEP_FAILED` as before. This also covers a model whose window kvai doesn't know, which is never compacted by size.
   Compaction's count adds 6,400 characters (1,600 tokens) for each image a message shows, which it counted as none.
3. **A failed model call is tried five times** (asked; chosen over turning pi-ai's own retries on, ADR 0009, 59). pi-ai
   reads the provider's `Retry-After` for its own retries only and doesn't give it to kvai, so kvcoder decides: after
   1 s, 4 s, 15 s, and then 60 s, about 80 s in all, where it was 20 s; a 503 after ADR 0050 still ended a turn.
4. **The lead's calls ask for the long cache** (asked; chosen over a setting and over no change). `kvai.complete` takes
   `cacheRetention?: 'short' | 'long'`, passed to pi-ai; left out, pi-ai's default (`short`) applies. pi-ai maps `long`
   to the provider's longer cache where the model has one (an hour on Anthropic, 24 hours on OpenAI) and to the default
   elsewhere. kvcoder sends `long` for the steps and summaries of a session with no parent, which wait on the person,
   approvals, `background wait`, and helpers for longer than five minutes; a helper's calls and a title's send none.
5. **An artifact is changed with `edit`.** The `artifact` connector's description adds: `To change part of an existing
   artifact, use edit; write it again only when most of it changes.` (a quarter of `artifact write` text rewrote an
   artifact the chat already had).
6. **The retry line says why and when.** The chunk is `{ type: 'retry', attempt, of, waitMs, reason }`, `reason` being
   `rateLimited` for `kvai/RATE_LIMITED` and `unavailable` otherwise, and the activity line reads
   `Retrying in {seconds} s: the provider is limiting calls ({attempt} of {of})` or
   `Retrying in {seconds} s: the provider didn't answer ({attempt} of {of})`.
7. **Helpers stay on the chat's model.** Not changed: a worker with no model uses `kvcoder.delegate.model`, then the
   chat's, as ADR 0069, 3 says; the person sets a cheaper one when they want it.
8. **A brief quotes what the lead holds.** The lead's Delegate rule now reads: `A worker sees none of this conversation
   and reads again every file it needs, so put in the brief the paths, the exact lines it needs quoted when they are
   short, and what you already found, so it doesn't read again what you hold.`
9. **A synchronous `delegate run`'s wait** keeps the lead's cache through decision 4.
10. **A helper runs no checks of its own.** It is created with its parent's check results less the `worker:` ones, and
    a session with a parent never runs the program workers' checks (it can't delegate). A helper whose parent has no
    results yet runs the binary connectors' checks at its first step, as before.
11. **Each model's own thinking levels** (asked; recommended in each question).
    - The levels are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, in `kvai.complete`'s `thinking`,
      `kvcoder.thinking`, a session's `thinking`, and a subagent worker's `thinking`.
    - `kvai.model.list` gives each model's `thinkingLevels`, in that order: pi-ai's `getSupportedThinkingLevels` for a
      built-in model; for a custom model, `off` to `high` when it reasons, and `off` alone when it doesn't (the same
      rule for a model with no level map).
    - A level a model doesn't have moves to the nearest one it has, by pi-ai's rule (the next higher, else the next
      lower): `kvcoder.session.configure` moves the session's level so when it sets a model, or a level the model
      doesn't have; a new session and a helper start with their level moved so; `kvai.complete` sends a level that
      pi-ai moves the same way. So what the picker shows is what is sent.
    - The thinking picker lists the session's model's levels. For a model with `off` alone it stays in place, disabled,
      showing Off. A worker's form lists the levels of the worker's model, and all seven when it uses the chat's.
    - `xhigh` and `max` are `Extra high` and `Max` (`مرتفع جدًا` and `أقصى`).

## Verification

Scenarios QA55-H and QA55-E, written before source, in `milestones/QA55-TEST-CASES.md`.
