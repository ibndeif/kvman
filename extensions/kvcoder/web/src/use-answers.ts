import { computed, onBeforeUnmount, watch, type Ref } from 'vue';
import type { Json } from '@kvman/sdk';
import type { Kvman } from '@kvman/sdk/web';
import type { Approval } from './ApprovalsCard.vue';
import type { LiveCall } from './live-step.ts';
import { problemOf, toastProblem } from './kvman.ts';
import { ownsQuestionDraft, questionDraft, settledQuestions, settleQuestionDraft, type QuestionOwner } from './question-drafts.ts';

/** A rule the person asked to remember with an allowed call (ADR 0091, 3). */
export type Rule = { kind: 'line'; prefix: string } | { kind: 'files' };
export type Answer = { questionId: string; answer: Json; remember?: Rule; reason?: string };
export type Decision = { approvals: Approval[]; confirmed: boolean; owner?: QuestionOwner | undefined; remember?: Rule | undefined; reason?: string | undefined };
export type Answers = {
  hidden: Ref<Set<string>>;
  answer(answer: Answer): Promise<void>;
  decide(decision: Decision): Promise<void>;
};
const allowedCall = (approval: Approval): LiveCall => {
  const description = approval.view.description ?? approval.view.line;
  return { name: 'run', ...(description === undefined ? {} : { description }), ...(approval.view.label === undefined ? {} : { label: approval.view.label }), complete: true };
};

export function useAnswers(kvman: Kvman, refresh: (ran: readonly LiveCall[]) => Promise<void>, owner: () => QuestionOwner | undefined): Answers {
  const hidden = computed(() => settledQuestions(kvman.workspace.value.id));
  const allowed = new Map<string, LiveCall>();
  let epoch = 0;
  let closed = false;
  watch([() => kvman.workspace.value.id, () => owner()?.sessionId, () => owner()?.turnId], () => { epoch += 1; allowed.clear(); }, { flush: 'sync' });
  onBeforeUnmount(() => { closed = true; epoch += 1; });

  // An approval's draft belongs to the turn that asks it, which for a helper's card is not the displayed one.
  async function send(answers: readonly Answer[], asker?: QuestionOwner): Promise<void> {
    const workspaceId = kvman.workspace.value.id;
    const expected = epoch;
    const current = (): boolean => !closed && epoch === expected && kvman.workspace.value.id === workspaceId;
    const items = answers.map(item => ({ item, draft: questionDraft(workspaceId, item.questionId, asker) }));
    if (items.some(({ draft }) => draft.sending)) return;
    const pending = items.filter(({ draft }) => !draft.settled);
    for (const { draft } of pending) { draft.sending = true; draft.error = undefined; }
    let jobId: string | null = null;
    for (const [index, { item, draft }] of pending.entries()) {
      if (!current()) {
        for (const rest of pending.slice(index)) if (ownsQuestionDraft(workspaceId, rest.item.questionId, rest.draft)) rest.draft.sending = false;
        return;
      }
      // Authoritative settlement may have removed a queued item while an earlier response was pending.
      if (!ownsQuestionDraft(workspaceId, item.questionId, draft)) continue;
      try {
        jobId = (await kvman.exec('kvcoder.question.answer', item)).jobId ?? jobId;
        if (ownsQuestionDraft(workspaceId, item.questionId, draft)) settleQuestionDraft(draft);
      } catch (error) {
        if (problemOf(error)?.code === 'kvcoder/QUESTION_NOT_FOUND') {
          if (ownsQuestionDraft(workspaceId, item.questionId, draft)) draft.sending = false;
          continue; // Reread authoritative state rather than pretending this response is an answer ACK.
        }
        for (const rest of pending.slice(index)) {
          if (ownsQuestionDraft(workspaceId, rest.item.questionId, rest.draft)) {
            rest.draft.sending = false;
            if (rest.draft === draft) rest.draft.error = error;
          }
          allowed.delete(rest.item.questionId);
        }
        if (current() && ownsQuestionDraft(workspaceId, item.questionId, draft)) toastProblem(kvman, error);
        return;
      }
    }
    if (!current()) return;
    const ran = jobId === null ? [] : [...allowed.values()];
    if (jobId !== null) allowed.clear();
    await refresh(ran).catch((error: unknown) => { if (current()) toastProblem(kvman, error); });
  }
  return {
    hidden,
    answer: answer => send([answer]),
    decide: ({ approvals, confirmed, owner: asker, remember, reason }) => {
      if (confirmed) for (const approval of approvals) allowed.set(approval.questionId, allowedCall(approval));
      const extras = { ...(remember === undefined ? {} : { remember }), ...(reason === undefined ? {} : { reason }) };
      return send(approvals.map(approval => ({ questionId: approval.questionId, answer: { confirmed }, ...extras })), asker);
    },
  };
}
