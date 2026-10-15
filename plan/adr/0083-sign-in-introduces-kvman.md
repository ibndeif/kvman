# ADR 0083 — a sign-in introduces itself as kvman, on pi-ai 1.2.0

Status: accepted by the product owner on 2026-10-15, before source. It replaces ADR 0026, 11 (the pi-ai version), amends ADR 0009, 65, and amends plan 07.

## Context

Signing in to OpenAI with a ChatGPT plan showed "Pi" on OpenAI's consent screen, not kvman. pi-ai's ChatGPT sign-in sends the agent name hint `Pi`, and its Codex sign-in sends the originator `pi`; pi-ai 1.0.4 has no way to change either. pi-ai 1.2.0, the latest version, adds `LoginOptions.agentName`: the name the app introduces itself with during a sign-in, used for both. Its other changes are additive (optional fields, updated model lists, and an Anthropic sign-in that falls back to another loopback port when its own is taken), except one: a model whose price varies, which pi-ai 1.0.4 gave negative rates, now has rates of 0, so it can't be told from a free model by its price. In 1.0.4 these were OpenRouter's `openrouter/auto`, `openrouter/auto-beta`, and `typesafe/jev-router`.

## Decisions

1. **pi-ai is 1.2.0** (asked; chosen over staying on 1.0.4), the latest version, pinned exactly. This replaces ADR 0026, 11.
2. **Every sign-in passes `agentName: 'kvman'`** (asked; chosen over a preset-only setting that a product could change). The name is fixed: a product built on kvman introduces itself as kvman too.
3. **Router models stay out, by name** (asked; chosen over listing them at $0, which would show their calls as free). kvai leaves out every built-in model with a negative rate, as before, and the OpenRouter models `openrouter/auto`, `openrouter/auto-beta`, and `typesafe/jev-router`: `kvai.model.list` doesn't list them, and a call to one fails `kvai/MODEL_UNKNOWN`. This amends ADR 0009, 65.

## Limits

- A provider shows the name of the app its sign-in is registered for: Claude's sign-in is Claude Code's, and GitHub Copilot's is GitHub's own. kvman can't change those.
- A router model OpenRouter adds later is listed at $0 until it is named in decision 3.
- Two names stay pi-ai's and are not shown to the person: the `originator` header of Codex model calls, and the `referrer` of xAI's device sign-in.

## Verification

Scenario QA15-E22, QA38-H9 rewritten for 1.2.0, and M2.1-E20 extended to the three router models, written before source.
