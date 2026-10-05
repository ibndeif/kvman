import { dropRuns } from '../delegate/runs.ts';
import { z, type Ctx, type Stored } from '@kvman/sdk';
import { dropProcesses } from '../jobs/process-run.ts';
import { firePoint } from '../registry/session-points.ts';
import { settingSchemas } from '../register-settings.ts';
import type { SessionDoc, Title } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { noUsage } from '../turns/history.ts';
import { now } from './session-lookup.ts';

// A new top-level session (plan 08 §8.1): `kvcoder.model` (or `kvai.defaultModel`) and `kvcoder.thinking`. Creating one
// schedules the daily retention job, keyed so it never piles up (ADR 0009, 103).

export async function newSession(ctx: Ctx, title: Title | undefined): Promise<Stored<SessionDoc>> {
  const model = settingSchemas.model.parse(await ctx.settings.get('kvcoder.model')) ?? z.string().nullable().parse(await ctx.settings.get('kvai.defaultModel'));
  const stamp = now();
  const session = await records(ctx.store).sessions.insert({
    title: title ?? '',
    autoTitle: title === undefined,
    status: 'idle',
    parentId: null,
    worker: null,
    model,
    thinking: settingSchemas.thinking.parse(await ctx.settings.get('kvcoder.thinking')),
    stepJobId: null,
    turnId: null,
    endedTurns: 0,
    nextSeq: 0,
    usage: noUsage(),
    durationMs: 0,
    checks: null,
    connectors: null,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await ctx.schedule('kvcoder.session.prune', {}, { cron: '0 3 * * *', key: 'session-prune' });
  await firePoint(ctx, 'kvcoder.session.created', { sessionId: session.id });
  return session;
}

/** Deletes a session's records, and its subagent sessions' (plan 08 §8.1). */
export async function deleteSessionTree(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  await dropProcesses(ctx, sessionId);
  await dropRuns(ctx, sessionId);
  for (const child of await store.sessions.find({ parentId: sessionId }, { limit: 1000 })) await deleteSessionTree(ctx, child.id);
  for (const collection of [store.messages, store.queued, store.turns, store.questions, store.background, store.sections, store.artifacts]) {
    for (let found = await collection.find({ sessionId }, { limit: 1000 }); found.length > 0; found = await collection.find({ sessionId }, { limit: 1000 })) {
      for (const document of found) await collection.delete(document.id);
    }
  }
  await store.sessions.delete(sessionId);
}
