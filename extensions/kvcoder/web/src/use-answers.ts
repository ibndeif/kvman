import { ref, type Ref } from 'vue';
import type { Json } from '@kvman/sdk';
import type { Kvman } from '@kvman/sdk/web';
import type { Approval } from './ApprovalsCard.vue';
import type { LiveCall } from './live-step.ts';
import { problemOf, toastProblem } from './kvman.ts';

// Sending the person's answers (plan 08 §8.5, ADR 0009, 141, 142). A card says what was answered and leaves at once; this
// sends it, so a card unmounting never loses its request. A failed answer brings the cards back with the toast, one the
// server no longer has is dropped quietly, and an allowed command shows as running in the step that follows.

export type Answer = { questionId: string; answer: Json };
export type Decision = { approvals: Approval[]; confirmed: boolean };

export type Answers = {
  hidden: Ref<Set<string>>;
  answer(answer: Answer): Promise<void>;
  decide(decision: Decision): Promise<void>;
};

const allowedCall = (approval: Approval): LiveCall => {
  const description = approval.view.description ?? approval.view.line;
  return { name: 'run', ...(description === undefined ? {} : { description }), ...(approval.view.label === undefined ? {} : { label: approval.view.label }), complete: true };
};

export function useAnswers(kvman: Kvman, refresh: (ran: readonly LiveCall[]) => Promise<void>): Answers {
  const hidden = ref(new Set<string>());
  const allowed = new Map<string, LiveCall>();

  function bringBack(answers: readonly Answer[]): void {
    for (const { questionId } of answers) {
      hidden.value.delete(questionId);
      allowed.delete(questionId);
    }
  }

  async function send(answers: readonly Answer[]): Promise<void> {
    for (const { questionId } of answers) hidden.value.add(questionId);
    let jobId: string | null = null;
    for (const [index, item] of answers.entries()) {
      try {
        jobId = (await kvman.exec('kvcoder.question.answer', item)).jobId ?? jobId;
      } catch (error) {
        if (problemOf(error)?.code === 'kvcoder/QUESTION_NOT_FOUND') continue;
        bringBack(answers.slice(index));
        toastProblem(kvman, error);
        return;
      }
    }
    const ran = jobId === null ? [] : [...allowed.values()];
    if (jobId !== null) allowed.clear();
    await refresh(ran).catch((error: unknown) => toastProblem(kvman, error));
  }

  return {
    hidden,
    answer: (answer) => send([answer]),
    decide: ({ approvals, confirmed }) => {
      if (confirmed) for (const approval of approvals) allowed.set(approval.questionId, allowedCall(approval));
      return send(approvals.map((approval) => ({ questionId: approval.questionId, answer: { confirmed } })));
    },
  };
}
