# ADR 0167 — `ext.registerPrompt`: derived names, stored prompts, and commands

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.13
- **Decided by**: the product owner

## Question

`05` §5.3 and §5.5, `08` §8.10 and §8.13, and `10` §10.5 sketch `ext.registerPrompt(name, PromptDef)`: it registers a collection, a list query, `answer` and `reject` (access `user`) and `expire` (internal) commands, `asked` and `closed` events, and `<ns>/BUSY`, and returns a handle whose `open(ctx, data)` stores the prompt and defers the reply. They leave open:

- how the collection's and the list query's plural is formed;
- what a stored prompt holds, and whether closed prompts are kept;
- what the list query filters on;
- what `reject` replies;
- the payload names;
- what an unknown prompt id gives;
- whether the extension can add its own effects on close or close a prompt itself.

## Options

1. A full contract with an `onClose` hook and `handle.close`.
2. **Exactly the plan: the same derived names and shapes, with no hooks.**
3. The full contract with an explicit `plural`.

For an unknown prompt id:

1. **`REPLY_NOT_AWAITING` from the kernel.**
2. A registered `<ns>/NOT_FOUND`.

## Decision

Option 2, and `REPLY_NOT_AWAITING` for an unknown id.

**Definition**

```ts
const questions = ext.registerPrompt('interviewer.question', {
  description: string,
  data: ZodObject,                          // what open() stores
  answer: ZodObject,                        // what the person answers
  oneOpenPer?: (data) => string,            // at most one open prompt per value
});
questions.open(ctx, data) → Deferred        // in a command handler: return questions.open(ctx, data)
```

- `name` is a public name `<ns>.<noun>`. Its last segment is the **noun**.
- The **plural** is the noun plus `s` (`question` → `questions`).
- The **id field** is the noun in camelCase plus `Id` (`question` → `questionId`, `tool-call` → `toolCallId`).
- `data` and `answer` must be object schemas.
- The handle has only `open`. The extension adds its own effects on close by subscribing to `<ns>.<noun>.closed`.

**What it registers** (in the manifest and `/schema` like hand-written registrations)

- **Collection** `<plural>` (private). Its schema:

  ```ts
  { id, data, status: 'open' | 'answered' | 'rejected' | 'expired', answer?, openKey?, openedAt, closedAt? }
  ```

  - Its indexes are `[['status', 'openedAt'], ['openKey']]`.
  - `id` is the deferred command's message id.
  - Closed prompts are kept.
- **Query** `<ns>.<plural>.list` (access `all`).
  - Input: `{ status?, limit? (1–100, default 100), ...each data field, optional }`. Every given data field must equal `data.<field>`.
  - Output: `{ items }`, the matching stored prompts oldest first (`openedAt`, then `id`).
- **Command** `<ns>.<noun>.answer { <idField>, ...answer }` (access `user`):
  - calls `ctx.reply(id, answer)`;
  - sets `status: 'answered'`, `answer`, and `closedAt`;
  - publishes `closed`.
- **Command** `<ns>.<noun>.reject { <idField> }` (access `user`):
  - calls `ctx.reply(id, { rejected: true })`;
  - sets `status: 'rejected'` and `closedAt`;
  - publishes `closed`.
- **Command** `<ns>.<noun>.expire { commandId, reason }` (access `internal`, the `onAbort` of `02` §2.8):
  - sets `status: 'expired'` and `closedAt`;
  - publishes `closed`.
- **Events** (durable):
  - `<ns>.<noun>.asked { <idField> }`;
  - `<ns>.<noun>.closed { <idField>, status }`.
- **Error** `<ns>/BUSY` (not retryable), registered once per extension when any of its prompts has `oneOpenPer`. An extension that also registers `<ns>/BUSY` itself fails recording, as any duplicate does.

**Behavior**

- `open(ctx, data)`:
  - is called in a command handler;
  - validates `data`;
  - with `oneOpenPer`, fails `<ns>/BUSY` (with the value as a parameter) when a prompt with the same `openKey` is open;
  - stores the prompt as `open`, with `openedAt` from `ctx.now()`;
  - publishes `asked`;
  - returns `ctx.defer({ onAbort: '<ns>.<noun>.expire' })`.

  Outside a command handler, `ctx.defer` fails `VALIDATION_FAILED` as before (ADR 0074).
- `answer` and `reject` always call `ctx.reply`. A prompt that is not open, and an unknown id, fail with the kernel's `REPLY_NOT_AWAITING`, and the unit rolls back. That is how the first answer wins.
- An `expire` for a prompt that is not open changes nothing.

**What follows from these shapes**

- `data` fields named `status` or `limit`, and an `answer` field named like the id field, would collide with the derived inputs, so recording fails `EXT_MANIFEST_INVALID` at the prompt's first derived type.
- A data-field filter is the filter language's `eq` (`04` §4.3): it matches JSON scalars. A filter value that is an object or an array fails `VALIDATION_FAILED`.
- A name without a dot, or whose last segment is not a kebab-case word, fails recording the same way.

## Consequences

- `@kvman/sdk` gains `registerPrompt`, `PromptDef`, and `PromptHandle` (a changeset). It registers the pieces through the same `ext` calls, so recording and validation are unchanged.
- `08` §8.10's example passes `rootSessionId: '$slot.sessionId'`, and `10` §10.5 says the interviewer's list filters on `rootSessionId` and dismisses its notification from its own `closed` subscription.
- `05` §5.3 and §5.5 state these rules.
