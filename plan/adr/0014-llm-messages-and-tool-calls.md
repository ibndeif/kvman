# ADR 0014 — `LlmMessage` and `ToolCall`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner

## Question

`LlmRequest.messages: LlmMessage[]` and `LlmResult.toolCalls?: ToolCall[]` (`05` §5.11) are used by every provider and by the agent, but neither type is defined.

## Options

1. **Three roles** — `user`, `assistant`, and `tool` messages; tool results reference their call.
2. **Two roles** — tool results as parts of a user message.

## Decision

Option 1:

```ts
type ToolCall = { id: string; name: string; args: JsonObject };
type LlmContentPart = { type: 'text'; text: string } | { type: 'image'; blobId: string; mime: string };
type LlmMessage =
  | { role: 'user'; content: string | LlmContentPart[] }
  | { role: 'assistant'; content: string; thinking?: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string; isError?: boolean };
```

`ModelDef.cost` is optional (a local model has no price), and provider and model titles are `Text`.

## Consequences

`05` §5.11 defines these types.
