# Models

Call a model with `kvai.complete`. kvai runs the provider call, streams deltas while it runs, and returns the answer.

```ts
const answer = await ctx.exec('kvai.complete', {
  systemPrompt: 'You are a helpful editor.',
  messages: [{ role: 'user', content: 'Hello!', timestamp: Date.now() }],
  tools: [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }],
  thinking: 'low',
});
```

Input:

- `model?: '<provider>/<model>'` — default: the `kvai.defaultModel` setting.
- `systemPrompt?: string`.
- `messages: Message[]` — pi-ai's user, assistant, and toolResult messages, so a harness can store its context as JSON.
- `tools?: [{ name, description, parameters }]` — `parameters` is a JSON Schema. Tool calls in the answer are returned, never run.
- `thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'` — default `'off'`. Use one of the model's `thinkingLevels`; pi-ai moves a level the model doesn't have to the nearest one it has, the next higher, else the next lower.
- `maxTokens?: number` — default: the model's own default.
- `sessionId?: string` — the conversation the call belongs to. kvai passes it to the provider as its prompt cache key and session affinity, so the calls of one conversation read the provider's cache. Left out, nothing is sent.
- `cacheRetention?: 'short' | 'long'` — how long the provider keeps the prompt's cache: `long` is its longer cache where the model has one (an hour on Anthropic, 24 hours on OpenAI). Left out, pi-ai's default, `short`, applies.

Output: `{ message: AssistantMessage, stopReason: 'stop' | 'length' | 'toolUse', usage: { input, output, cacheRead, cacheWrite, cost } }`. The message keeps `role`, `content`, `api`, `provider`, `model`, `responseId?`, `usage`, `stopReason`, and `timestamp`.

While the call runs, kvai reports `{ type: 'text' | 'thinking', delta }` and `{ type: 'toolcall', name, arguments? }` through the job's progress as `{ source: '@kvman/kvai', data }`. Cancelling the job aborts the provider call. Failures are Problems: `kvai/KEY_MISSING`, `kvai/RATE_LIMITED`, `kvai/USAGE_LIMIT` (the account is out of usage or quota), `kvai/REFUSED` (the provider declined the request for its content), `kvai/CONTEXT_TOO_LONG`, `kvai/PROVIDER_ERROR` (with `params.transient`), and the sign-in codes. The harness decides whether to call again.

## Listing and choosing models

`kvai.model.list { provider? }` answers every built-in and custom model: `[{ id, name, provider, reasoning, thinkingLevels, input, contextWindow, maxTokens, cost, builtIn, isDefault }]`. `thinkingLevels` lists the model's levels in order: a built-in model's from pi-ai, and a custom one's `off` to `high` when it reasons, else `off` alone. The default model is the `kvai.defaultModel` setting (`'<provider>/<model>'`); `kvai.model.default.get` answers `{ id, name, ready }` — whether that model exists and its provider can be called. Set the setting to choose a different default. Built-in models are pi-ai's, plus pi.dev's live catalog when the `kvai.catalog.url` setting names it (the coder preset does): kvai fetches it at start and every 4 hours, and a model released after kvai's pi-ai is listed and called like the others.

## When no model is connected

- If `model` is given, call it directly; an unknown one fails `kvai/MODEL_UNKNOWN`.
- If no `model` is given and `kvai.defaultModel` is null, the call fails `kvai/NO_MODEL`. Call `kvai.model.list` to find candidates and set `kvai.defaultModel` first.
- If the chosen model's provider has neither an API key nor a sign-in, the call fails `kvai/KEY_MISSING`. Connect the provider first; see [Providers](providers.md).
- `kvai.model.default.get` returning `ready: false` tells the same story before a call: no default, an unknown id, or a provider that isn't connected. Show that state and let the person pick or connect rather than calling blind.
