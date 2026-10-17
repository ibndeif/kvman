import { reactive } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { idleLive } from './live-step.ts';
import type { Child } from './use-conversation.ts';

// The chat's background helpers that wait on the person (plan 08 §8.7, ADR 0085, 1): their decisions show in the chat
// whatever the lead is doing. A foreground helper's show under the call that waits on it, so it is never listed here.

export type WaitingHelper = { child: Child; call: string };

export async function loadWaitingHelpers(kvman: Kvman, sessionId: string): Promise<Map<string, WaitingHelper>> {
  const jobs = await kvman.exec('kvcoder.job.list', { sessionId });
  const waiting = jobs.filter((job) => job.kind === 'subagent' && job.status === 'waiting');
  const found = await Promise.all(
    waiting.map(async (job) => {
      const [session, [turn]] = await Promise.all([kvman.exec('kvcoder.session.get', { sessionId: job.id }), kvman.exec('kvcoder.turn.list', { sessionId: job.id, limit: 1 })]);
      if (session.parentId !== sessionId) return [];
      return [[job.id, { child: { session, turn: turn?.sessionId === job.id ? turn : undefined, live: reactive(idleLive()) }, call: job.call }] as const];
    }),
  );
  return new Map(found.flat());
}
