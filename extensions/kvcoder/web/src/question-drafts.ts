import { reactive } from 'vue';
import type { Turn } from '../../src/index.ts';

export type QuestionOwner = { sessionId: string; turnId: string };
export type QuestionDraft = {
  text: string;
  selected: string[];
  other: string;
  sending: boolean;
  error: unknown;
  settled: boolean;
  owner: QuestionOwner | undefined;
};

// Module lifetime is application lifetime, unlike the bridge supplied to each custom component.
// A workspace's map is never replaced: computed readers keep tracking the one they first read.
const workspaces = new Map<string, Map<string, QuestionDraft>>();
function drafts(workspaceId: string): Map<string, QuestionDraft> {
  let found = workspaces.get(workspaceId);
  if (found === undefined) {
    found = reactive(new Map<string, QuestionDraft>());
    workspaces.set(workspaceId, found);
  }
  return found;
}

export function questionDraft(workspaceId: string, questionId: string, owner?: QuestionOwner): QuestionDraft {
  const list = drafts(workspaceId);
  let found = list.get(questionId);
  if (found === undefined) {
    found = reactive({ text: '', selected: [], other: '', sending: false, error: undefined, settled: false, owner });
    list.set(questionId, found);
  } else if (owner !== undefined && found.owner === undefined) found.owner = owner;
  return found;
}

export const ownsQuestionDraft = (workspaceId: string, questionId: string, draft: QuestionDraft): boolean => drafts(workspaceId).get(questionId) === draft;
export const settledQuestions = (workspaceId: string): Set<string> => new Set([...drafts(workspaceId)].filter(([, draft]) => draft.settled).map(([id]) => id));

export function settleQuestionDraft(draft: QuestionDraft): void {
  draft.text = ''; draft.selected = []; draft.other = '';
  draft.error = undefined; draft.sending = false; draft.settled = true;
}

export function reconcileQuestionDrafts(workspaceId: string, sessionId: string, turns: readonly Turn[]): void {
  const list = drafts(workspaceId);
  for (const [id, draft] of list) {
    if (draft.owner?.sessionId !== sessionId) continue;
    const turn = turns.find(item => item.id === draft.owner?.turnId && item.sessionId === sessionId);
    // A bounded list omitting the owned turn proves nothing.
    if (turn === undefined) continue;
    if (turn.outcome === undefined && turn.endedAt === undefined && turn.pending.some(item => item.questionId === id)) continue;
    settleQuestionDraft(draft);
    list.delete(id);
  }
}
