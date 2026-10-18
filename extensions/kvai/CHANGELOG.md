# @kvman/kvai

## 0.1.4

### Patch Changes

- 07ec488: `kvai.complete` takes `cacheRetention?: 'short' | 'long'` and passes it to pi-ai, which uses the provider's longer prompt cache for `long` where the model has one (ADR 0087, 4).
- 8c275ef: `kvai.complete` takes the thinking levels `xhigh` and `max`, and `kvai.model.list` gives each model its `thinkingLevels`: pi-ai's for a built-in model, and `off` to `high` for a custom one that reasons, else `off` alone (ADR 0087, 11).
- Updated dependencies [d541dbc]
  - @kvman/sdk@0.1.3

## 0.1.3

### Patch Changes

- 1c1dd1d: A plan sign-in introduces itself as kvman, so OpenAI's consent screen no longer says "Pi". kvai now uses pi-ai 1.2.0, and OpenRouter's router models, whose price varies, stay out of the model list (ADR 0083).

## 0.1.2

### Patch Changes

- 90fb869: Tell a usage limit and a content refusal apart from other provider failures with two new codes, `kvai/USAGE_LIMIT` and `kvai/REFUSED`, each with its own text. A stream that ends before its final event is now `transient`, so a caller's retry applies.
- 0616ef9: kvai: a provider failure whose whole reason is `terminated`, a connection dropped while the answer was read, is transient, so kvcoder retries it. kvcoder: `fs edit` returns the two ends of a long change around `[… N lines not shown …]` in place of up to 80 lines, and the new setting `kvcoder.delegate.model` is the model a helper uses when its worker names none, shown on Coder's page as "Model for workers". The lead offers to record how a project is built, tested, and run in its `AGENTS.md` (ADR 0069).
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
  - @kvman/sdk@0.1.2

## 0.1.1

### Patch Changes

- be303fb: kvai uses `@earendil-works/pi-ai` 1.0.4, the latest version.

## 0.1.0

The first published version. What it holds, in the order it was built:

- kvai: `kvai.complete` over pi-ai's built-in providers and models, custom and delegate providers, per-workspace usage totals, and the Models page.
- kvai's pages without `tabs`: Models, a page per provider with its API key box, and Add a provider; `kvai.provider.get`, `kvai.provider.key.set` (sync only) and `kvai.provider.key.delete`, `kvai.model.default.get`, a `status` and model count on provider rows (replacing `key`), and `isDefault` on model rows.
- Export kvai's message schema at `@kvman/kvai/messages`, so a harness can check its stored context as `kvai.complete` takes it.
- The tool-call chunk of `kvai.complete`'s stream carries each argument as it completes, and the usage status item reads "Workspace 3.6K tokens · $0.0004".
- `kvai/PROVIDER_ERROR` says in `params.transient` whether a second try may fix the failure (an HTTP 5xx, a timeout, a dropped connection).
- A tool call's `toolcall` stream chunk reports a string argument over 16 KiB as `null`, so a very large call no longer fails its step against the 64 KiB progress-chunk limit; the returned call keeps the whole value.
- An HTTP 408, 409, or 425 from a provider is marked `transient`, so a second try may fix it.
- A provider can be disconnected (`kvai.provider.disconnect`), and a built-in provider that has an OAuth flow in pi-ai (ChatGPT Plus/Pro, Claude Pro/Max, GitHub Copilot, and others) can be signed in to with the person's plan (`kvai.provider.signin.start`, `signin.answer`, `signin.cancel`). Provider rows gain `connection`, `signIn`, and `apiKey`, a sign-in is kept as the secret `<provider>.oauth` and refreshed by calls one worker at a time, and the Provider page's connection card is the new `kvai.connection` component.
- The Models page leads with what is connected: a default-model card with a searchable "Change model" picker, "Connected" cards, quick-connect tiles (sign in with Claude, ChatGPT, or GitHub Copilot; Anthropic, Google, xAI, or your own server by key), and "All providers" with search. The Provider page has a header, two clear choices ("Your plan" and "An API key") or a connected card, a sign-in progress panel, and a searchable models list with "Make default". Every provider has a coloured letter avatar, and both pages work on a phone and right to left.
- kvai documents itself: the public queries `kvai.docs.list` and `kvai.docs.get` serve the pages `models` and `providers`, so an agent or `kvman-docs` can read how to call a model and how providers are connected.
- A streamed `toolcall` chunk sends `null` for any argument value over 16 KiB, counting an object's or array's JSON, not only a string's bytes (ADR 0011, 22). A tool with a large nested argument can no longer pass the 64 KiB progress-chunk limit. The returned message keeps the whole value.
- kvai.complete takes `sessionId?`, the conversation a call belongs to, and passes it to the provider as its prompt cache key and session affinity.
- The Arabic catalog was reviewed against the app, and `kvai.defaultModel` has a plain description.
- kvai gives its configuration: the default model and a link to the Models page (ADR 0014).
- kvai's configuration picks `kvai.defaultModel` from a searchable list (the new component `kvai.default-model`), saved into the scope the extension's page is set to. The "Change model" picker now behaves like the chat's: every word typed is searched, the current model is checked, and a count replaces the cap of 100 models (ADR 0015).
- kvai's status item says what it counts: "Workspace total, with cached: … tokens" (ADR 0017).
