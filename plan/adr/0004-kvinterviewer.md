# ADR 0004 — kvinterviewer

Status: superseded by ADR 0005, 8 (asking moved into kvcoder; kvinterviewer removed). Kept for its reasoning.

1. **Waiting.** Continuations, never waiting. `kvinterviewer.question.ask { question, then: { command, input } }` stores the question and returns `{ questionId }` at once. On an answer or a dismissal, kvinterviewer queues `then.command` async in the question's workspace. Questions survive restarts.
2. **Kinds.**
   - `text { prompt, placeholder? }` → `{ text }`
   - `choice { prompt, multiple, options: [{ id, label, description? }], other? }` → `{ selected: id[], other? }`
   - `confirm { prompt, danger? }` → `{ confirmed }`

   Texts are plain strings written by the asker (often an LLM), not translation keys.
3. **Surfacing.**
   - `ask` sends the progress chunk `{ type: 'component', component: 'kvinterviewer.question', props: { questionId } }`, so a chat shows the question inline.
   - A Questions panel lists open questions, and a status item shows the open count.
4. **Scope.** Questions only; no notifications.
5. **One question per ask.**
6. **Dismiss and cancel.**
   - The person may dismiss a question: `then` runs with `{ questionId, dismissed: true }`.
   - The asking extension may cancel one: `then` doesn't run.
7. **Inline UI.** kvwebui's chat renders any `{ type: 'component', component, props }` chunk as a `custom` component (ADR 0002, 31). kvinterviewer ships `kvinterviewer.question`, which its panel also uses.
8. **Retention.** A question is deleted when it closes (answered, dismissed, or cancelled). Acting on it afterwards fails with `kvinterviewer/QUESTION_NOT_FOUND`.
9. **API.** All public:
   - `ask` → `{ questionId }`. `then.command` must be a public command of the asker, else `kvinterviewer/THEN_INVALID`.
   - `answer { questionId, answer }`: checked against the kind (`VALIDATION_FAILED`), then queues `then.command` with `then.input` plus `{ questionId, answer }`.
   - `dismiss { questionId }`.
   - `cancel { questionId }`: only the asker, else `kvinterviewer/NOT_ASKER`.
   - `get { questionId }`.
   - `list { limit }`: the open questions of the workspace.
   - `kvinterviewer.ui.get`.
10. **Answerer.** Only the person answers or dismisses: a caller that isn't `{ kind: 'user' }` gets `kvinterviewer/USER_ONLY`.
11. **Following the continuation.** `answer` and `dismiss` return `{ jobId }` of the queued continuation. The `kvinterviewer.question` component calls `kvman.follow(jobId)` after answering (ADR 0002, 32).
