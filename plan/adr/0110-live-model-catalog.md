# ADR 0110 — New models from pi.dev's live catalog

Status: accepted by the product owner on 2026-10-30. It amends plan 07 (§7.2 and its settings) and plan 11 (the
`coder` preset's settings).

## Context

OpenAI released GPT-6.1 Terra on 2026-10-26. kvai lists pi-ai's built-in catalog (plan 07 §7.2), and the newest
pi-ai, 1.4.0 (ADR 0109), was published on 2026-10-21, so kvman can't offer the model. The owner pointed out that pi
itself lists it.

pi doesn't wait for a release either. Its coding agent (`@earendil-works/pi-coding-agent`,
`core/remote-catalog-provider.js`) lays a live catalog over each built-in provider's models: it fetches
`https://pi.dev/api/models/providers/<provider>` at start and every 4 hours, sends the stored ETag as `If-None-Match`,
and uses the answer only when its `Last-Modified` is later than the date pi-ai's built-in data was generated
(`getBuiltinModelDataGeneratedAt()`, 2026-10-21 for 1.4.0). A live model replaces the built-in one with the same id,
and a model the live list doesn't have stays. A failed or missing catalog leaves the built-in list as it is. The code
for this lives in the coding agent, not in pi-ai, which only gives the store and refresh hooks.

On 2026-10-30 pi.dev's catalogs were dated that day: `openai`, `openai-codex`, and `github-copilot` list
`gpt-6.1-terra`, and `openrouter` lists four Terra variants. Each entry is a whole pi-ai chat model (`api`,
`baseUrl`, `compat`, `thinkingLevelMap`, tiered `cost`), so pi-ai 1.4.0 calls it like a built-in one:
`streamSimple` needs only the model's provider to be registered.

## Decisions

1. **kvai takes new models from pi.dev's live catalog, automatically** (asked: "Live catalog, auto"), as pi does,
   with no new dependency: kvai fetches the catalog itself rather than taking pi's coding agent for one function.
2. **One setting, `kvai.catalog.url`** (asked): the catalog's address, a URL or `null`. `null` keeps the built-in
   list alone and makes no network call. It defaults to `null`, and the `coder` preset sets `https://pi.dev`
   (asked: "Off by default, coder on"), as it sets `kvai.defaultModel`, so a test kernel never touches the
   network and an app made with `/build-kvman` turns it on in its own preset.
3. **No new UI** (asked): new models simply appear in the model lists and pickers.
4. **When.** If `kvai.catalog.url` isn't `null` when kvman starts, kvai's `kernel.started` handler runs
   `kvai.catalog.refresh` once with `execAsync` and schedules it on the cron `0 */4 * * *` with the key
   `catalog-refresh`. Setting the URL later takes effect at the next start; setting it to `null` takes effect at
   once (decision 6).
5. **`kvai.catalog.refresh`**, a private command, `{}` → `{}`, `retries: 0` (the next run is the retry). With
   `kvai.catalog.url` `null` it does nothing. Otherwise, for every built-in provider at once, it asks
   `GET <url>/api/models/providers/<provider>?types=chat` with `accept: application/json`, `user-agent: kvman`,
   the stored ETag as `if-none-match` when the stored list came from the same URL, and a 4 s limit per request
   (pi's). The request carries no key, account, or payload.
   - `200`: the provider's entry in kvai's global store becomes `{ provider, url, models, lastModified, etag }`.
     `lastModified` is the `Last-Modified` header, 0 when missing or invalid. The list is read as pi reads it: an
     array, `{ models: [...] }`, or an object of models.
   - `304`: the stored entry stays.
   - `404` or `501` (no catalog for that provider): the entry becomes an empty list.
   - Anything else (another status, a timeout, a dropped connection, a body that isn't JSON): that provider's
     stored entry stays. Once every provider is done, the command fails `kvai/PROVIDER_ERROR { provider, reason,
     transient }` for the first one that failed, where `reason` is its status or error and `transient` follows plan
     07 §7.1.
6. **The merge.** A provider's live models count when its stored entry's `url` is the current `kvai.catalog.url`
   and its `lastModified` is later than pi-ai's built-in data. They join that provider's built-in models: a live
   model replaces the built-in one with the same id, the others are added, and a built-in model missing from the
   live list stays.
   - kvai keeps only the live entries that are chat models (no `type`, or `chat`), that are valid pi-ai models
     (the fields `kvai.model.list` shows, plus `api` and `baseUrl`), and whose `api` is one that provider's built-in
     models use, so the installed pi-ai can call them. It drops the rest.
   - The rules of §7.2 still apply: a model whose price varies (a negative rate, or a router named there) isn't
     listed.
   - Live models are built-in ones: `builtIn: true` in `kvai.model.list`, counted in the provider's `models`, and
     `kvai.model.remove` fails `kvai/BUILT_IN` for them.

7. **Idle memory** (asked: "Accept and re-record"). The start's refresh loads pi-ai's built-in catalog in a worker,
   which a session otherwise loads at its first model list or call: idle RSS with the coder preset went from about
   275 MB to about 292 MB, under plan 12's 300 MB target. The refresh doesn't load pi-ai's main module (its failure
   check lives in a module of its own). `bench/baseline.json` was recorded again on 2026-10-30, since the old one,
   from 2026-10-05, was 238 MB, below today's build even with the catalog off.
8. **Tests stay offline.** Test kernels start with `kvai.catalog.url` `null`. The tests and benchmarks that run the
   real `coder` preset as a program (kvbuilder's e2e tests, `bench/kvman-run.ts`) start kvman with Node's
   `NODE_USE_ENV_PROXY`, an `HTTPS_PROXY` on a closed local port, and `NO_PROXY` for 127.0.0.1, so their refresh
   fails at once and only local servers are reached.

## Limits

- pi.dev is pi's service, with no published contract. If its answers change shape, kvai drops the entries it can't
  read, and the built-in list stays.
- A router pi.dev adds later is listed at 0 until it is named in §7.2, as ADR 0109 says for pi-ai.
- A model pi.dev lists with an `api` that the installed pi-ai doesn't know isn't listed until kvai's pi-ai is
  upgraded.

## Verification

Scenarios M2.1-E24 to E31 in `milestones/M2.1-TEST-CASES.md`, in `extensions/kvai/test/live-catalog.test.ts`,
against a local fake catalog server.
