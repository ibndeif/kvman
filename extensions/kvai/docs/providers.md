# Providers

A **provider** is a model source kvai can call. `kvai.provider.list` answers the catalog: every built-in provider (pi-ai's) plus custom ones, each with `[{ id, title, builtIn, status: 'ready' | 'needsKey' | 'noKey', models, connection: 'apiKey' | 'oauth' | null, signIn, apiKey }]`. `status` is `ready` when the provider is connected (a key is set or it is signed in), `needsKey` for a built-in with neither, and `noKey` for a custom provider without a key. `kvai.provider.get { id }` answers one row.

Built-in models come from pi-ai and are always listed; custom providers and their models live in kvai's global store, and their ids are `<provider>/<model>`.

## Connecting a provider

A provider is connected by an API key or by a plan sign-in — never both. Saving a key deletes the sign-in, and signing in deletes the key.

- **API key.** `kvai.provider.key.set { provider, key }` writes the secret `<provider>.apiKey` (the `key` field is write-only). A built-in provider then counts as connected; a custom `api` provider sends it, or the placeholder `none` when unset, which a local server ignores. `kvai.provider.key.delete { provider }` removes it, and `kvai.provider.disconnect { provider }` removes key and sign-in together.
- **Plan sign-in (OAuth).** A built-in provider with a pi-ai OAuth flow (ChatGPT Plus/Pro, Claude Pro/Max, GitHub Copilot, and others) can be connected by signing in with the person's plan instead of a key. `kvai.provider.signin.start { provider }` streams the flow — an auth URL, a device code, a prompt the person answers (`kvai.provider.signin.answer`), progress — and the sign-in is kept as the secret `<provider>.oauth`. Calls refresh an expiring token themselves; one rejected fails `kvai/SIGNIN_EXPIRED`, and one failing for a temporary reason fails `kvai/PROVIDER_ERROR` with `transient: true`. `kvai.provider.signin.cancel` stops a running sign-in.

## Custom providers

`kvai.provider.add` takes one of two forms, plus `id` and `title`:

- `{ api, baseUrl, headers?, compat? }`: pi-ai speaks one of its wire APIs to `baseUrl`: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, or `mistral-conversations`. Ollama and vLLM are added this way. A custom provider needs no key: without one, calls send the placeholder `none`.
- `{ delegate: '<public command>' }`: `kvai.complete` forwards calls for this provider's models to the command. That command takes and returns `kvai.complete`'s shapes and may stream the same deltas.

Adding the same id again replaces the provider (a built-in id fails `kvai/BUILT_IN`); a replaced provider keeps its models. `kvai.provider.remove { id }` deletes it and its models. Models of a custom provider are added with `kvai.model.add { provider, id, name, reasoning, input, contextWindow, maxTokens, cost? }` and removed with `kvai.model.remove { id }`.

## How other extensions add providers

An extension that wants its models reachable through kvai adds a **delegate** provider: it registers its own public command that accepts `kvai.complete`'s input and returns its output shape (streaming the same delta chunks when it can), then registers the provider with `kvai.provider.add { id, title, delegate: '<that command>' }`. Everything a caller gets from `kvai.complete` — models, usage, settings — then works for it. It must not see or hold credentials; a delegate never needs an API key.

## Where credentials are kept

Secrets stay in `secrets.json` (the kernel's per-home store) and are never shown, returned, stored elsewhere, or logged: the sign-in's tokens and a failure's reason included. Environment variables are not read. A person sets keys through the UI or `kvai.provider.key.set`; an extension reads none of them.
