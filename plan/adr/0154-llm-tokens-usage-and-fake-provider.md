# ADR 0154 — Token counts, usage rows, and the testkit's fake provider

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.9
- **Decided by**: the product owner

## Question

The plan does not say:

- what `kernel.llm.tokens.count` answers when the provider registered no `countTokens`;
- the shape of the "rows" of `kernel.llm.usage.get`;
- which options the testkit's `fakeProvider(...)` takes. `05` §5.10 shows only `{ reply }`.

## Options

- **Token count:**
  1. **An estimate with `exact: false`.**
  2. Fail.
- **Usage:**
  1. **Aggregated rows.**
  2. Raw rows without `groupBy`.
- **Fake provider:**
  1. **Scripted options.**
  2. `reply` only.

## Decision

Option 1 in each case.

**`kernel.llm.tokens.count`** (a query, capability `llm`) takes an `LlmRequest` and answers `{ tokens, exact }`, resolving the model as a call would:

- when the provider registered `countTokens`, it answers `{ tokens: <its answer>, exact: true }`;
- otherwise it estimates `ceil(characters / 4)` over the system prompt, the text of every message (text parts, tool results, assistant text and thinking), and the canonical JSON of the tools and tool calls; images count 0. The answer has `exact: false`.

**`kernel.llm.usage.get { workspaceId?, from?, to?, groupBy? }`** answers:

```ts
{ rows: Array<{ key: string | null; calls: number; input: number; output: number;
                cacheRead: number; cacheWrite: number; costUsd: number }> }
```

- `key` depends on `groupBy`:
  - `model`: `provider/id`;
  - `extension`: the calling extension;
  - `day`: the local date `YYYY-MM-DD`;
  - no `groupBy`: `null`, one total row.
- `from` is inclusive and `to` exclusive, in epoch ms, on the row's `at`.
- Rows are sorted by key.
- A missing `cost_usd` counts as 0.
- With no calls in range, the result is one zero row without `groupBy`, and no rows with it.

**`fakeProvider(options?)`** (`@kvman/testkit`) returns an extension definition, installed like any extension:

- package `@kvman/fake-provider`, namespace `fake`, provider id `fake`;
- one model, `fake-model`: thinking `low`, `medium`, and `high`, tools and vision, cost 1 per MTok of input and 2 per MTok of output, context 100,000, max output 10,000;
- `status` answers `{ configured: true }`.

Its options:

```ts
fakeProvider({
  reply?: string,            // 'ok'
  thinking?: string,
  chunks?: string[],         // text deltas; default [reply]
  failures?: number,         // retryable LLM_CALL_FAILED before a success; 0
  retryAfterMs?: number,     // on those failures
  usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number },  // { input: 10, output: 5 }
  costUsd?: number,          // absent: the kernel prices it from the model
})
```

It sends each chunk as a `delta`, then `thinking` (when set) as one thinking delta, and answers `content: reply`, `stopReason: 'end'`, and the requested model. The failure count is kept per fake provider instance. The `createTestKernel` of M2.13 takes it as an extension. There `fakeProvider(options)` returns a descriptor that the testkit places as data, and the count is kept per loaded instance (ADR 0165).

## Consequences

- `03` §3.8 (`kernel.llm.tokens.count` and `kernel.llm.usage.get` rows) and `05` §5.10 state these rules.
- `@kvman/testkit` gains its first public export, with a changeset.
