# 08 — kvinterviewer (namespace `kvinterviewer`)

kvinterviewer lets any extension ask the person a question and get the answer later. Nothing waits: the asking job finishes at once, and the answer arrives as a new async job of a command the asker named (a continuation). Questions survive restarts.

## 8.1 Questions

| Kind | Question | Answer |
|---|---|---|
| `text` | `{ kind: 'text', prompt, placeholder? }` | `{ text }` |
| `choice` | `{ kind: 'choice', prompt, multiple: boolean, options: [{ id, label, description? }] (2–10), other?: boolean }` | `{ selected: id[], other?: string }` |
| `confirm` | `{ kind: 'confirm', prompt, danger?: boolean }` | `{ confirmed: boolean }` |

- Texts are plain strings written by the asker, often by an LLM, not translation keys.
- One ask holds one question.

## 8.2 Flow

1. **Ask.** An extension's handler calls `kvinterviewer.question.ask { question, then: { command, input } }` and gets `{ questionId }`.
   - `then.command` must be a public command of the asking extension, or the ask fails with `kvinterviewer/THEN_INVALID`.
   - The question belongs to the job's workspace.
2. **Show.** `ask` sends the progress chunk `{ type: 'component', component: 'kvinterviewer.question', props: { questionId } }`, so a chat that started the turn shows the question inline. The Questions panel and the status count show it too.
3. **Close.**
   - **The person answers** (`answer`). The answer is checked against the question's kind (`VALIDATION_FAILED`). Then `then.command` is queued with `then.input` plus `{ questionId, answer }`.
   - **The person dismisses it** (`dismiss`). `then.command` is queued with `then.input` plus `{ questionId, dismissed: true }`.
   - **The asker cancels it** (`cancel`). `then.command` doesn't run.
4. **Delete.** The question is deleted when it closes. Any later action on it fails with `kvinterviewer/QUESTION_NOT_FOUND`.

## 8.3 API

All are public.

| Name | Kind | Input → output | Rule |
|---|---|---|---|
| `kvinterviewer.question.ask` | command | `{ question, then: { command, input } }` → `{ questionId }` | `kvinterviewer/THEN_INVALID` |
| `kvinterviewer.question.answer` | command | `{ questionId, answer }` → `{ jobId }` (the continuation) | person only (`kvinterviewer/USER_ONLY`) |
| `kvinterviewer.question.dismiss` | command | `{ questionId }` → `{ jobId }` (the continuation) | person only (`kvinterviewer/USER_ONLY`) |
| `kvinterviewer.question.cancel` | command | `{ questionId }` → `{}` | the asker only (`kvinterviewer/NOT_ASKER`) |
| `kvinterviewer.question.get` | query | `{ questionId }` → `Question` | |
| `kvinterviewer.question.list` | query | `{ limit }` → `Question[]` (open, this workspace) | |
| `kvinterviewer.ui.get` | query | UI contributions (§8.4) | |

A `Question` is `{ id, question, asker, createdAt }`.

## 8.4 UI

- The `kvinterviewer.question` Vue component (`/web/kvinterviewer/components/question.js`) renders one question with its answer controls and a dismiss button. After answering or dismissing, it calls `kvman.follow(jobId)`, so a chat streams the continued turn.
- `kvinterviewer.ui.get` contributes:
  - a **Questions** panel that lists the open questions with that component;
  - a **status item** with the open count.
