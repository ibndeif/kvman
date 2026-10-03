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
  - `{ type: 'toolcall', name }`, when a tool call starts, then `{ type: 'toolcall', name, arguments }` each time one more argument is complete and once more with all of them when the call ends (`arguments` holds the completed values only, ADR 0009, 144, with a string value over 16 KiB sent as `null`, ADR 0009, 189)
- **Cancel.** The job's signal aborts the provider call.
- **Failures.** The harness decides whether to call again. Each Problem's `params` name what failed (ADR 0009, 63).

  | Code | When |
  |---|---|
  | `kvai/KEY_MISSING` | A built-in provider has neither an API key nor a sign-in (ADR 0009, 53 and 228). |
  | `kvai/NO_MODEL` | No `model` was given and `kvai.defaultModel` is `null`. |
  | `kvai/MODEL_UNKNOWN` | No such model. |
  | `kvai/RATE_LIMITED` | The provider rate-limited the call. |
  | `kvai/CONTEXT_TOO_LONG` | The context doesn't fit the model. |
  | `kvai/PROVIDER_ERROR` | Any other provider failure, including a failed delegate call (its code in `params.cause`). `params.transient` says whether a second try may fix it: an HTTP 408, 409, 425, or 5xx, overloaded or unavailable, a timeout, a dropped or refused connection, or a DNS failure; `kvai/RATE_LIMITED` is always transient (ADR 0009, 154 and 203). |
  | `kvai/PROVIDER_UNKNOWN` | `kvai.model.add` or a provider command names no known provider (ADR 0009, 55). |
  | `kvai/SIGNIN_EXPIRED` | A provider connected by sign-in refused to refresh it (`params.provider`); not transient: the person signs in again (ADR 0009, 235). |
  | `kvai/SIGNIN_UNSUPPORTED` | `kvai.provider.signin.start` names a provider with no sign-in (ADR 0009, 230). |
  | `kvai/SIGNIN_FAILED` | A sign-in failed (`params: { provider, reason }`, ADR 0009, 230 and 233). |
  | `kvai/SIGNIN_NOT_WAITING` | `kvai.provider.signin.answer` names a provider whose sign-in isn't waiting for an answer (ADR 0009, 231). |
  | `kvai/KEY_UNSUPPORTED` | `kvai.provider.key.set` names a provider that takes no API key (ADR 0009, 229). |

- **Usage.** Each call adds its tokens (input, output, cache reads, cache writes) and cost to the workspace's per-model totals.

## 7.2 Providers and models

- **Built-ins.** pi-ai's built-in providers and their chat models are always there, all of them (ADR 0009, 52), except models with a negative (varying) price (ADR 0009, 65).
- **Custom providers and models** are kept in kvai's global store. Custom models belong to custom providers: `kvai.model.add` naming a built-in provider fails `kvai/BUILT_IN` (ADR 0009, 55).
- A model id is `<provider>/<model>`, split at the first `/` (model ids may contain one). `kvai.model.list` and `kvai.model.remove` use the full id; `kvai.model.add { provider, id }` takes the model's own id (ADR 0009, 54).

**Adding a provider.** `kvai.provider.add` takes one of two forms:
- `{ id, title, api, baseUrl, headers?, compat? }`: pi-ai speaks one of its wire APIs to `baseUrl`: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, or `mistral-conversations` (ADR 0009, 56). Ollama and vLLM are added this way.
- `{ id, title, delegate: '<public command>' }`: `kvai.complete` forwards calls for this provider's models to the command. That command takes and returns `kvai.complete`'s shapes and may stream the same deltas.

**Adding the same id again.** A custom id replaces the provider or model; a replaced provider keeps its models. A built-in id fails with `kvai/BUILT_IN`. Removing an id that doesn't exist does nothing (ADR 0009, 57).

**API keys.** A provider's key is the kvai secret `<provider>.apiKey`, set on the provider's page (`kvai.provider.key.set`, sync only) or in kvwebui's Settings secrets section (ADR 0009, 79). Environment variables are not read. A built-in provider needs its key or a sign-in; a custom `api` provider sends its key when set, and otherwise the placeholder `none`, which a local server ignores; a delegate never needs one (ADR 0009, 53).

**Plan sign-ins (OAuth).** A built-in provider that pi-ai has an OAuth flow for (ChatGPT Plus/Pro, Claude Pro/Max, GitHub Copilot, and the others, `signIn: true` in its row) can be connected by signing in with the person's plan instead of a key (ADR 0009, 226–237).
- **One credential.** A provider is connected by an API key or by a sign-in, never both: saving a key deletes the sign-in, and signing in deletes the key. The sign-in is the secret `<provider>.oauth` (pi-ai's credential as JSON); tokens are never logged, stored elsewhere, returned, or left in a failure's reason.
- **The flow.** `kvai.provider.signin.start { provider }` is a command the UI starts with `execAsync` (`retries: 0`, `timeoutMs` 300 000). It streams `{ source: '@kvman/kvai', data }` chunks: `{ type: 'auth_url', url }`, `{ type: 'device_code', userCode, verificationUri, expiresInSeconds? }`, `{ type: 'prompt', kind: 'text' | 'select' | 'manual_code', message, placeholder?, options? }` (the job then waits for `kvai.provider.signin.answer`), and `{ type: 'progress' }`. Its browser flows listen on `127.0.0.1` only while the sign-in runs (port 1455 for ChatGPT), and when that fails the person pastes the redirect URL as the answer to a `manual_code` prompt. A `PI_OAUTH_CALLBACK_HOST` other than loopback fails the sign-in.
- **Using it.** A call refreshes an expiring token itself, one worker at a time per provider (a lease in the global store). A refresh the provider rejects fails `kvai/SIGNIN_EXPIRED`, and one that fails for a temporary reason fails `kvai/PROVIDER_ERROR` with `transient: true`.

| Name | Kind | Input → output |
|---|---|---|
| `kvai.complete` | command | §7.1 |
| `kvai.provider.list` | query | `{}` → `[{ id, title, builtIn, status: 'ready' \| 'needsKey' \| 'noKey', models, connection: 'apiKey' \| 'oauth' \| null, signIn, apiKey }]`: `ready` when `connection` isn't `null` (its key is set or it is signed in), `needsKey` for a built-in without either, `noKey` for a custom provider without a key; `models` is its model count; `signIn` says it offers a sign-in, and `apiKey` that it takes a key (`false` for `openai-codex`) (ADR 0009, 79 and 229) |
| `kvai.provider.get` | query | `{ id }` → one provider row; an unknown id fails `kvai/PROVIDER_UNKNOWN` |
| `kvai.provider.key.set` | command, sync only | `{ provider, key }` → `{}`: writes the secret `<provider>.apiKey` and deletes the provider's sign-in; `key` is `writeOnly`; an unknown provider fails `kvai/PROVIDER_UNKNOWN`, and a provider that takes no key `kvai/KEY_UNSUPPORTED` |
| `kvai.provider.key.delete` | command | `{ provider }` → `{}`: a missing key does nothing; an unknown provider fails `kvai/PROVIDER_UNKNOWN` |
| `kvai.provider.disconnect` | command | `{ provider }` → `{}`: deletes the provider's key and its sign-in; a provider with neither does nothing; an unknown provider fails `kvai/PROVIDER_UNKNOWN` (ADR 0009, 226) |
| `kvai.provider.signin.start` | command | `{ provider }` → `{}`: signs in with the person's plan (§7.2); a provider with no sign-in fails `kvai/SIGNIN_UNSUPPORTED`, a failed one `kvai/SIGNIN_FAILED` (ADR 0009, 230) |
| `kvai.provider.signin.answer` | command, sync only | `{ provider, answer }` → `{}`: answers the prompt a sign-in waits at; none waiting fails `kvai/SIGNIN_NOT_WAITING` (ADR 0009, 231) |
| `kvai.provider.signin.cancel` | command | `{ provider }` → `{}`: cancels the provider's running sign-in; none running does nothing (ADR 0009, 232) |
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

`kvai.ui.get` contributes (ADR 0009, 79, 238–249):
- a **Models** page (the nav item): a heading and intro, then the custom component `kvai.providers` (ADR 0009, 238–244): the default-model card with "Change model" (a searchable picker of the models of callable providers); "Connected" (a card for each connected or custom provider, with Manage); "Connect a provider" (tiles from a fixed list: Claude, ChatGPT, and GitHub Copilot to sign in with a plan; Anthropic, Google, xAI, and "Your own server" for a key or a local server); and "All providers" (the rest, A–Z, with search and "Show 25 more"). Each provider has a coloured letter avatar.
- a **Provider** page (`params: ['providerId']`): the custom component `kvai.provider` (ADR 0009, 245–247): a header (avatar, title, `<id> · N models`, a chip, and a back link); the connection section (how the provider is connected; two choices, "Your plan" and "An API key", when it offers both; Disconnect while connected; the sign-in's link, device code, prompts, and Cancel while signing in; Remove provider for a custom provider); and the provider's models with a search, the Default chip, and "Make default".
- an **Add a provider** page: the forms of `kvai.provider.add` and `kvai.model.add`.
- a **status item** with the workspace's tokens and cost, from `kvai.usage.total.get` (ADR 0009, 60).

## 7.4 Testing

- Tests run a small scripted OpenAI-compatible streaming server on 127.0.0.1 (`@kvman/testkit/fake-openai`, ADR 0009, 62), and add it with `kvai.provider.add { api: 'openai-completions', baseUrl }`. They observe deltas with the testkit's `onProgress` (ADR 0009, 61).
- The real code path runs, with no test-only branch.
- Harness tests (kvcoder, kvcustomizer) reuse the same helper.

## 7.5 Documentation

kvai serves `kvai.docs.list` and `kvai.docs.get` (plan 09 §9.5): the pages `models` (calling a model with `kvai.complete`, choosing and listing models) and `providers` (connecting, adding a provider, how a plan sign-in works), as Markdown from its `docs/` folder (ADR 0010, 16).
