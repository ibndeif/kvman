# 07 — kvai (namespace `kvai`)

kvai gives every extension LLM calls through providers and models. It exposes nothing else. Agents, tools, context, harnesses, and loops belong to the extensions that need them.

It depends on `@earendil-works/pi-ai` (0.99.1), pinned exactly (ADR 0009, 51).

## 7.1 The call: `kvai.complete`

A public command. It is registered with `retries: 0` and `maxInputBytes` of 32 MiB.

```ts
kvai.complete {
  model?: '<provider>/<model>',     // default: the kvai.defaultModel setting
  systemPrompt?: string,
  messages: Message[],              // pi-ai's user, assistant, and toolResult messages
  tools?: [{ name, description, parameters }],   // parameters: JSON Schema
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high',   // default 'off'
  maxTokens?: number,               // default: pi-ai's default for the model
} → { message: AssistantMessage, stopReason: 'stop' | 'length' | 'toolUse', usage: { input, output, cacheRead, cacheWrite, cost } }
```

- `Message` and `AssistantMessage` are pi-ai's JSON types (text, image, thinking, and toolCall blocks), validated with zod in kvai. So a harness can store its context as JSON. The returned message keeps pi-ai's core fields: `role`, `content` (with the blocks' signatures), `api`, `provider`, `model`, `responseId?`, `usage`, `stopReason`, and `timestamp`; `diagnostics` and the rest are dropped (ADR 0009, 58).
- `usage.cost` is pi-ai's total cost in US dollars. kvai turns pi-ai's own request retries off (ADR 0009, 59).
- Tool calls in the answer are returned, never run.
- **Streaming.** While the call runs, kvai reports these through `ctx.job.progress`. They reach the root job's stream as `{ source: '@kvman/kvai', data }`, so the UI of the harness's turn sees them.
  - `{ type: 'text', delta }`
  - `{ type: 'thinking', delta }`
  - `{ type: 'toolcall', name }`, when a tool call starts
- **Cancel.** The job's signal aborts the provider call.
- **Failures.** The harness decides whether to call again. Each Problem's `params` name what failed (ADR 0009, 63).

  | Code | When |
  |---|---|
  | `kvai/KEY_MISSING` | A built-in provider's key isn't set (ADR 0009, 53). |
  | `kvai/NO_MODEL` | No `model` was given and `kvai.defaultModel` is `null`. |
  | `kvai/MODEL_UNKNOWN` | No such model. |
  | `kvai/RATE_LIMITED` | The provider rate-limited the call. |
  | `kvai/CONTEXT_TOO_LONG` | The context doesn't fit the model. |
  | `kvai/PROVIDER_ERROR` | Any other provider failure, including a failed delegate call (its code in `params.cause`). |
  | `kvai/PROVIDER_UNKNOWN` | `kvai.model.add` names no known provider (ADR 0009, 55). |

- **Usage.** Each call adds its tokens (input, output, cache reads, cache writes) and cost to the workspace's per-model totals.

## 7.2 Providers and models

- **Built-ins.** pi-ai's built-in providers and their chat models are always there, all of them (ADR 0009, 52), except models with a negative (varying) price (ADR 0009, 65).
- **Custom providers and models** are kept in kvai's global store. Custom models belong to custom providers: `kvai.model.add` naming a built-in provider fails `kvai/BUILT_IN` (ADR 0009, 55).
- A model id is `<provider>/<model>`, split at the first `/` (model ids may contain one). `kvai.model.list` and `kvai.model.remove` use the full id; `kvai.model.add { provider, id }` takes the model's own id (ADR 0009, 54).

**Adding a provider.** `kvai.provider.add` takes one of two forms:
- `{ id, title, api, baseUrl, headers?, compat? }`: pi-ai speaks one of its wire APIs to `baseUrl`: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, or `mistral-conversations` (ADR 0009, 56). Ollama and vLLM are added this way.
- `{ id, title, delegate: '<public command>' }`: `kvai.complete` forwards calls for this provider's models to the command. That command takes and returns `kvai.complete`'s shapes and may stream the same deltas.

**Adding the same id again.** A custom id replaces the provider or model; a replaced provider keeps its models. A built-in id fails with `kvai/BUILT_IN`. Removing an id that doesn't exist does nothing (ADR 0009, 57).

**API keys.** A provider's key is the kvai secret `<provider>.apiKey`, set on the provider's page (`kvai.provider.key.set`, sync only) or in kvwebui's Settings secrets section (ADR 0009, 79). Environment variables are not read. OAuth providers wait for a later phase. A built-in provider needs its key; a custom `api` provider sends it when set, and otherwise the placeholder `none`, which a local server ignores; a delegate never needs one (ADR 0009, 53).

| Name | Kind | Input → output |
|---|---|---|
| `kvai.complete` | command | §7.1 |
| `kvai.provider.list` | query | `{}` → `[{ id, title, builtIn, status: 'ready' \| 'needsKey' \| 'noKey', models }]`: `ready` when its key is set, `needsKey` for a built-in without one, `noKey` for a custom provider without one; `models` is its model count (ADR 0009, 79) |
| `kvai.provider.get` | query | `{ id }` → one provider row; an unknown id fails `kvai/PROVIDER_UNKNOWN` |
| `kvai.provider.key.set` | command, sync only | `{ provider, key }` → `{}`: writes the secret `<provider>.apiKey`; `key` is `writeOnly`; an unknown provider fails `kvai/PROVIDER_UNKNOWN` |
| `kvai.provider.key.delete` | command | `{ provider }` → `{}`: a missing key does nothing; an unknown provider fails `kvai/PROVIDER_UNKNOWN` |
| `kvai.provider.add` | command | §7.2 → `{}` |
| `kvai.provider.remove` | command | `{ id }` → `{}` (also removes its models) |
| `kvai.model.list` | query | `{ provider? }` → `[{ id, name, provider, reasoning, input: ('text' \| 'image')[], contextWindow, maxTokens, cost, builtIn, isDefault }]` |
| `kvai.model.add` | command | `{ provider, id, name, reasoning, input, contextWindow, maxTokens, cost? }` → `{}` |
| `kvai.model.remove` | command | `{ id }` → `{}` |
| `kvai.model.default.get` | query | `{}` → `{ id, name, ready }`: `kvai.defaultModel` in the workspace, its name (`null` when unset or unknown), and whether its provider can be called (ADR 0009, 79) |
| `kvai.usage.get` | query | `{}` → `[{ model, input, output, cacheRead, cacheWrite, cost }]` for the workspace |
| `kvai.usage.total.get` | query | `{}` → `{ tokens, cost }` for the workspace, all models summed (ADR 0009, 60) |
| `kvai.ui.get` | query | kvai's UI contributions (§7.3) |

All of these are public. Removing a built-in provider or model fails with `kvai/BUILT_IN`.

**Setting.** `kvai.defaultModel`: a model id, or `null` (the default). Both bundled presets set `anthropic/claude-sonnet-5-5`; M2.1 checks that id against pi-ai's built-in list.

## 7.3 UI

`kvai.ui.get` contributes (ADR 0009, 79):
- a **Models** page (the nav item): the default model (a `detail` of `kvai.model.default.get`); the providers table, each row showing the provider's name with its id, its model count, and a status badge, and opening the provider's page; and a "Connect your own server" card linking to the add page.
- a **Provider** page (`params: ['providerId']`): the provider and its status; an API key form (`kvai.provider.key.set`, with the provider fixed) and a Remove button (`kvai.provider.key.delete`, after a confirmation); and its models, each with its name and id, thinking, context window, a "Default" badge, and a "Make default" row action that calls `kernel.settings.set` for `kvai.defaultModel` (global).
- an **Add a provider** page: the forms of `kvai.provider.add` and `kvai.model.add`.
- a **status item** with the workspace's tokens and cost, from `kvai.usage.total.get` (ADR 0009, 60).

## 7.4 Testing

- Tests run a small scripted OpenAI-compatible streaming server on 127.0.0.1 (`@kvman/testkit/fake-openai`, ADR 0009, 62), and add it with `kvai.provider.add { api: 'openai-completions', baseUrl }`. They observe deltas with the testkit's `onProgress` (ADR 0009, 61).
- The real code path runs, with no test-only branch.
- Harness tests (kvcoder, kvdev) reuse the same helper.
