import { reactive } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { idleLive } from './live-step.ts';
import type { Child } from './use-conversation.ts';

// The chat's background helpers that run or wait on the person (plan 08 §8.7, ADR 0085, 1; ADR 0108, 17): each shows as
// its card below the messages until its answer arrives, with its decisions, whatever the lead is doing.

export type WaitingHelper = { child: Child; call: string };

/** The helpers, by id; a helper already shown keeps its live step. */
export async function loadWaitingHelpers(kvman: Kvman, sessionId: string, shown: ReadonlyMap<string, WaitingHelper> = new Map()): Promise<Map<string, WaitingHelper>> {
  const jobs = await kvman.exec('kvcoder.job.list', { sessionId });
  const waiting = jobs.filter((job) => job.kind === 'subagent' && (job.status === 'waiting' || job.status === 'running'));
  const found = await Promise.all(
    waiting.map(async (job) => {
      const [session, [turn]] = await Promise.all([kvman.exec('kvcoder.session.get', { sessionId: job.id }), kvman.exec('kvcoder.turn.list', { sessionId: job.id, limit: 1 })]);
      if (session.parentId !== sessionId) return [];
      return [[job.id, { child: { session, turn: turn?.sessionId === job.id ? turn : undefined, live: shown.get(job.id)?.child.live ?? reactive(idleLive()) }, call: job.call }] as const];
    }),
  );
  return new Map(found.flat());
}
