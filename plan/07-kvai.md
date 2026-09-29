# 07 — kvai (namespace `kvai`)

kvai gives every extension LLM calls through providers and models. It exposes nothing else. Agents, tools, context, harnesses, and loops belong to the extensions that need them.

It depends on `@mariozechner/pi-ai`, pinned exactly.

## 7.1 The call: `kvai.complete`

A public command. It is registered with `retries: 0` and `maxInputBytes` of 32 MiB.

```ts
kvai.complete {
  model?: '<provider>/<model>',     // default: the kvai.defaultModel setting
  systemPrompt?: string,
  messages: Message[],              // pi-ai's user, assistant, and toolResult messages
  tools?: [{ name, description, parameters }],   // parameters: JSON Schema
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high',
  maxTokens?: number,
} → { message: AssistantMessage, stopReason, usage: { input, output, cacheRead, cacheWrite, cost } }
```

- `Message` and `AssistantMessage` are pi-ai's JSON types (text, image, thinking, and toolCall blocks), validated with zod in kvai. So a harness can store its context as JSON.
- Tool calls in the answer are returned, never run.
- **Streaming.** While the call runs, kvai reports these through `ctx.job.progress`. They reach the root job's stream as `{ source: '@kvman/kvai', data }`, so the UI of the harness's turn sees them.
  - `{ type: 'text', delta }`
  - `{ type: 'thinking', delta }`
  - `{ type: 'toolcall', name }`, when a tool call starts
- **Cancel.** The job's signal aborts the provider call.
- **Failures.** The harness decides whether to call again.

  | Code | When |
  |---|---|
  | `kvai/KEY_MISSING` | The provider's key isn't set. |
  | `kvai/NO_MODEL` | No `model` was given and `kvai.defaultModel` is `null`. |
  | `kvai/MODEL_UNKNOWN` | No such model. |
  | `kvai/RATE_LIMITED` | The provider rate-limited the call. |
  | `kvai/CONTEXT_TOO_LONG` | The context doesn't fit the model. |
  | `kvai/PROVIDER_ERROR` | Any other provider failure. |

- **Usage.** Each call adds its tokens (input, output, cache reads, cache writes) and cost to the workspace's per-model totals.

## 7.2 Providers and models

- **Built-ins.** pi-ai's built-in providers and models are always there.
- **Custom providers and models** are kept in kvai's global store.
- A model id is `<provider>/<model>`.

**Adding a provider.** `kvai.provider.add` takes one of two forms:
- `{ id, title, api, baseUrl, headers?, compat? }`: pi-ai speaks one of its wire APIs (`openai-completions`, `anthropic-messages`, …) to `baseUrl`. Ollama and vLLM are added this way.
- `{ id, title, delegate: '<public command>' }`: `kvai.complete` forwards calls for this provider's models to the command. That command takes and returns `kvai.complete`'s shapes and may stream the same deltas.

**Adding the same id again.** A custom id replaces the provider or model. A built-in id fails with `kvai/BUILT_IN`.

**API keys.** A provider's key is the kvai secret `<provider>.apiKey`, set in kvwebui's Settings secrets section. Environment variables are not read. OAuth providers wait for a later phase.

| Name | Kind | Input → output |
|---|---|---|
| `kvai.complete` | command | §7.1 |
| `kvai.provider.list` | query | `{}` → `[{ id, title, builtIn, key: 'set' \| 'missing' }]` |
| `kvai.provider.add` | command | §7.2 → `{}` |
| `kvai.provider.remove` | command | `{ id }` → `{}` (also removes its models) |
| `kvai.model.list` | query | `{ provider? }` → `[{ id, name, provider, reasoning, input: ('text' \| 'image')[], contextWindow, maxTokens, cost, builtIn }]` |
| `kvai.model.add` | command | `{ provider, id, name, reasoning, input, contextWindow, maxTokens, cost? }` → `{}` |
| `kvai.model.remove` | command | `{ id }` → `{}` |
| `kvai.usage.get` | query | `{}` → `[{ model, input, output, cacheRead, cacheWrite, cost }]` for the workspace |
| `kvai.ui.get` | query | kvai's UI contributions (§7.3) |

All of these are public. Removing a built-in provider or model fails with `kvai/BUILT_IN`.

**Setting.** `kvai.defaultModel`: a model id, or `null` (the default). Both bundled presets set `anthropic/claude-sonnet-5-5`; M2.1 checks that id against pi-ai's built-in list.

## 7.3 UI

`kvai.ui.get` contributes:
- a **Models** page, with:
  - the providers and their key state;
  - each provider's models;
  - forms to add a custom provider or model;
  - a default-model picker.
- a **status item** with the workspace's tokens and cost.

## 7.4 Testing

- Tests run a small scripted OpenAI-compatible streaming server on 127.0.0.1, and add it with `kvai.provider.add { api: 'openai-completions', baseUrl }`.
- The real code path runs, with no test-only branch.
- Harness tests (kvcoder, kvdev) reuse the same helper.
