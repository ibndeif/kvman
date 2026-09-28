# ADR 0153 — The LLM call path: provider context, configured providers, retries, and global calls

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.9
- **Decided by**: the product owner

## Question

`03` §3.12 and `05` §5.11 leave these open:

- **Provider context:** the `ctx` provider functions (`complete`, `status`, `listModels`, `countTokens`) receive. They are not message handlers and commit nothing.
- **Configured:** whether `status()` runs before every completion ("checks that its provider is enabled … and configured").
- **Retries:** how a failing call retries, and what a provider error that is not an LLM Problem becomes.
- **Global calls:** how a call from a handler without a workspace is resolved.

## Options

- **Provider context:**
  1. **A narrow read-only context.**
  2. The full handler `Ctx`.
- **Configured:**
  1. **`complete` reports it.**
  2. `status()` before each call.
- **Retries:**
  1. **The later of the backoff step and `retryAfterMs`; unknown errors become `LLM_CALL_FAILED`.**
  2. `retryAfterMs` wins.
  3. Unknown errors are `INTERNAL`.
- **Global calls:**
  1. **The global default, with the provider enabled anywhere.**
  2. Refused.

## Decision

Option 1 in each case.

**The provider context** (`@kvman/sdk` `ProviderContext`)

```ts
interface ProviderContext {
  readonly workspace: { id: string; path: string; name: string } | null; // the caller's; null for a global call
  readonly signal: AbortSignal;                                          // the caller's deadline and cancel
  readonly config: { get(): Promise<JsonObject> };                       // merged for that workspace
  readonly secrets: { get(name: string): Promise<string | undefined> };
  readonly log: Logger;
}
interface CompleteContext extends ProviderContext { delta(chunk: { text?: string; thinking?: string }): void }
```

- It is read-only: no store, messaging, steps, or processes.
- `status` runs per workspace (for `kernel.llm.providers.list`); a `status` that throws or misses the deadline answers `configured: false` there.
- `listModels` runs with `workspace: null` and the global config, because `llm_models` is global.
- `countTokens` and `complete` run for the caller's workspace.

**The call** (`kernel.llm.complete`, a kernel command, capability `llm`):

1. **Admission** checks `live.text` and `live.thinking`: each must name one of the caller's own registered live events whose chunk is `text` (`VALIDATION_FAILED` otherwise, `05` §5.11).
2. **Resolution:**
   - with no provider enabled for the call, `LLM_NOT_CONFIGURED`;
   - the model is the explicit `model`, else the workspace default for the purpose, else the global default; one that is not in the call's model list is `LLM_MODEL_NOT_FOUND`;
   - `thinking` other than `off` that the model's `capabilities.thinking` lacks is `LLM_THINKING_UNSUPPORTED`.
3. **Invocation:** the provider's `complete` runs in its extension's host, counted against that extension's concurrency limit, with the caller's deadline and abort signal. `status()` is not called first: an unconfigured provider fails with `llmProblem('LLM_NOT_CONFIGURED', …)`.
4. **Deltas:** each `delta` is published as a `{ text }` chunk of `live.text` (thinking on `live.thinking`), with `run` = the caller's message id (the `kernel.llm.complete` message's causation), each skipped when not set.
5. **Result:** the provider's result, checked against `llmResultSchema`, is the reply. The unit that commits it also writes one `llm_usage` row:
   - `message_id` is the `kernel.llm.complete` message;
   - `ws` is its workspace, or `''`;
   - `caller` is the calling extension, and `provider` and `model` come from the result's `model`;
   - tokens as reported;
   - `cost_usd` is the result's `costUsd`, else the model's `cost` × tokens (input and output per million; cache tokens unpriced), else `NULL`.

**Retries and failures**

- A retryable `LLM_CALL_FAILED` fails the attempt retryably, so the command goes through the normal retry path. The next attempt waits for the later of the backoff step and the provider's `retryAfterMs`.
- Other LLM codes fail the call at once.
- Any other error a provider throws becomes a retryable `LLM_CALL_FAILED`. Its message is not passed on or logged.
- A failed attempt's relayed live text is reset for its run before the retry (`02` §2.3).
- A provider result that does not match `llmResultSchema` is a non-retryable `LLM_CALL_FAILED`.

**Global calls** (like global types, `06` §6.4):

- the model is the explicit one, else the global default;
- the provider must be enabled in at least one workspace (`LLM_NOT_CONFIGURED` otherwise);
- the provider context has `workspace: null` and the global config;
- usage has `ws = ''`.

**Host protocol.** A provider function runs in its extension's host through new frames in `@kvman/protocol`:

- `provide` (kernel → host), with the invocation id, the extension, the provider id, the function, its input, the workspace, `deadlineAt`, and the correlation id;
- `provider.delta` and `provided` (host → kernel);
- `config.get` and `secrets.get` reuse the existing calls, keyed by the invocation.

## Consequences

- `03` §3.12 and `05` §5.11 state these rules.
- `@kvman/sdk` gains `ext.registerProvider`, `ext.registerModel`, `ProviderContext`, `ctx.llm`, and `llmProblem`.
- `@kvman/protocol` gains the provider frames and the `kernel.llm.*` schemas.
