# ADR 0094 — context and robustness: old results cleared, stream gaps measured, a check after edits, a fallback model

Status: accepted by the product owner on 2026-10-19 (every recommended option). It amends plan 08 §8.1, §8.2, §8.3, and
§8.7, and plan 07 §7.1 (a model call logs its longest silence). The web connector of the same phase waits for the
owner's choice of the dependency that turns HTML into text, and is not part of this ADR.

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, Phase E) measured the owner's chats:

- Tool results are 53% of the median prompt (78% at p90), and in a large context 78% of them are more than 20 messages
  old. Keeping the newest 40,000 tokens of results would have sent 17% fewer prompt tokens in all, and 49 summaries
  were made. Claude Code clears old results in place, and does it when the provider's cache has expired anyway.
- `kvai.complete` runs under the kernel's default 600 s timeout: a stream that goes silent holds the step for ten
  minutes and then fails the turn with `TIMEOUT`, which isn't retried. How long a thinking model may be silent while
  it works is not known, so the cut-off needs a measurement first.
- 118 check runs failed in the chats, 90 of them right after an edit: the model learns of the error a step or two late.
- 19 turns ended on a usage limit.

## Decisions

1. **Old tool results are cleared** (asked; recommended: both moments; ADR 0097, 4 clears the long text of their calls too).
   - A session record has `clearedThroughSeq` (old records read `null`). A tool result whose `seq` is at or before it is
     sent to the model as `[cleared to save memory: <call>. Make the call again if you need it.]`, where `<call>` names
     the call as `background` does (`fs read src/app.ts`; ADR 0089, 1). The stored message and the conversation don't
     change.
   - It moves forward only at the start of a step, and only over results older than the newest 40,000 tokens of tool
     results (characters / 4, after the latest summary): at a turn's first step when the chat's last model call is
     over an hour old, so the provider's cache has expired; or at any step when what could be cleared is over 20,000
     tokens and the prompt is over half the model's window.
   - A step that cleared doesn't summarize: the next call reports the prompt's real size.
   - `fs read`'s "unchanged since you read these lines" answer counts only results that weren't cleared.
2. **A model call's longest silence is logged** (asked; recommended: measure first). kvai logs, at the end of each
   model call, the time to its first stream event and its longest gap between events, as numbers with the model's id
   and no payload. The cut-off that ends a silent stream as a temporary failure is decided from a week of those logs, in
   a later ADR (ADR 0096 set it to 300 s before those logs existed).
3. **A check after edits** (asked; recommended: a setting the person fills). The setting `kvcoder.check`
   (`{ line, timeoutMs }` or `null`, the default; global and workspace scopes; `timeoutMs` from 1,000 to 600,000, 60,000
   by default) holds a line the person trusts. After the calls of a reply, the lead's or a helper's, when an `fs write`,
   `edit`, `undo`, or `assemble` ran at once and succeeded, kvcoder runs the line once in the real shell, without
   asking, and ends the last such result with a blank line, `[kvman ran the check: <line>, exit code N]`, and the last
   4 KB of its output. A change that waited for an approval runs no check. The call cards don't show it.
4. **A fallback model** (asked; recommended: a setting, off by default). The setting `kvcoder.fallbackModel` (a model id
   or `null`, the default) is the model a chat moves to when a step's model call fails `kvai/USAGE_LIMIT`, or
   `kvai/RATE_LIMITED` after all its tries, and the chat's model is another one: the chat's model becomes it, its level
   moves to one that model has (ADR 0087, 11), the notice `MODEL_SWITCHED { from, to, code }` is added, and the step
   calls the model once more. A failure of that call ends the turn as any other does.

## Consequences

- A long chat sends fewer tokens and is summarized later; the model calls again what it needs, by name.
- A project that names its check sees its errors in the same step that made them.
- A chat whose subscription ran out goes on with the fallback, and says so.
