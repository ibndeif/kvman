# @kvman/kvai

## 0.1.9

### Patch Changes

- 9512365: New models without a release: with the new `kvai.catalog.url` setting (the coder preset sets `https://pi.dev`), kvai lays pi.dev's live model catalog over pi-ai's built-in list at start and every 4 hours, so models such as GPT-6.1 Terra can be picked and called (ADR 0110).

## 0.1.8

### Patch Changes

- ec7f55e: kvai runs on pi-ai 1.4.0, so its new models (such as Gemini 4 Argon) can be picked; OpenRouter's Fusion and Pareto Code routers, which pi-ai prices at 0, stay out of the list (ADR 0109).

## 0.1.7

### Patch Changes

- 65805a4: A chat you can follow, tests you chose, and fewer slow steps (ADR 0102). kvcoder shows each step's headline from the agent's thinking as a line that opens to show it, folds the calls under it, and shows the newest headline, the turn's time, and the map's step in progress on the running line. A line that exited with another code than 0 reads `exit N` instead of "Failed". The agent asks once how to test a project and records a `Testing:` line in `AGENTS.md`, checks in proportion, keeps `AGENTS.md`'s Commands section to command lines, and never maps a bug fix or a change to one or two files; `execution-map set` takes each step's `details`. Helpers think at `kvcoder.delegate.thinking` (`medium`) when their worker names no level, and the thinking picker marks the high levels slower. Call arguments sent in common wrong shapes are repaired, `fs search` searches an invalid expression as text and ignores `context` with `filesOnly`, an MCP tool not found suggests near names, `delegate continue` queues a message for a helper still working, a summary is retried, and old tool results are cleared past 80,000 tokens in large batches. `kvcoder.job.restart` starts a background process again (Restart and Run again in the Running popover, which stays as `Background (N)`), `kvcoder.change.list` takes `scope: 'turn'` (the Changes view's "This turn"), a chat's placeholder title is its first line of prose, a step may run an hour, and `kvai.complete` may run 30 minutes.
- Updated dependencies [486d037]
- Updated dependencies [cc5845f]
  - @kvman/sdk@0.1.5

## 0.1.6

### Patch Changes

- 1942677: Counts that read as words (ADR 0098). A catalog text may hold plural forms separated by `|`, one per plural category of its language (English two, Arabic six), and kvwebui chooses one by a numeric `count` param, in `kvman.t`, toasts, and contributed views and status items. kvman's own count texts use them: `1 file`, `Show 1 earlier message`, `1 provider`, `Allow this command?`, `1 turn`. A fold of calls reads as a sentence, `Read 3 files, changed 1 file, ran 1 command · 1 failed`, with each file counted once, `fs read-files` counted as a read, the failures in the danger color, and the words at the row's start. The testkit's i18n guide explains plural forms.
- Updated dependencies [1942677]
  - @kvman/sdk@0.1.4

## 0.1.5

### Patch Changes

- 383ba9e: pi-ai loads with a worker's first model call or model list, not when kvai loads, as ADR 0009, 52 intended: idle memory with the coder preset falls from about 307 to 238 MB.
- de50f7d: Each model call logs its model, the time to its stream's first event, and its longest gap between events, with no payload, so a cut-off for a silent stream can be chosen from real use (ADR 0094, 2).
- dd316f0: A model stream with no event for 300 s, before its first event or between two, is aborted as a temporary `kvai/PROVIDER_ERROR` (`stream stalled`), so the caller's retries take it; a cancel stays a cancel (ADR 0096).

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
