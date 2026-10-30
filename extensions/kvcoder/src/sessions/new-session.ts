import { dropRuns } from '../delegate/runs.ts';
import { z, type Ctx, type Stored } from '@kvman/sdk';
import { dropProcesses } from '../jobs/process-run.ts';
import { firePoint } from '../registry/session-points.ts';
import { settingSchemas } from '../register-settings.ts';
import type { SessionDoc, Title } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { cancelTurn } from '../turns/end-turn.ts';
import { noUsage } from '../turns/history.ts';
import { levelFor } from '../turns/model-info.ts';
import { now } from './session-lookup.ts';

// A new top-level session (plan 08 §8.1): `kvcoder.model` (or `kvai.defaultModel`) and `kvcoder.thinking`, moved to a
// level the model has (ADR 0087, 11). Creating one
// schedules the daily retention job, keyed so it never piles up (ADR 0009, 103).

export async function newSession(ctx: Ctx, title: Title | undefined): Promise<Stored<SessionDoc>> {
  const model = settingSchemas.model.parse(await ctx.settings.get('kvcoder.model')) ?? z.string().nullable().parse(await ctx.settings.get('kvai.defaultModel'));
  const stamp = now();
  const session = await records(ctx.store).sessions.insert({
    title: title ?? '',
    autoTitle: title === undefined,
    deleting: false,
    status: 'idle',
    parentId: null,
    worker: null,
    model,
    thinking: await levelFor(ctx, model, settingSchemas.thinking.parse(await ctx.settings.get('kvcoder.thinking'))),
    decides: false,
    clearedThroughSeq: null,
    collapsedThroughSeq: null,
    webHosts: [],
    stepJobId: null,
    stepGeneration: 0,
    stepIntentId: null,
    turnId: null,
    endedTurns: 0,
    nextSeq: 0,
    usage: noUsage(),
    usageBy: { summary: noUsage(), title: noUsage(), helpers: noUsage() },
    durationMs: 0,
    checks: null,
    connectors: null,
    optedIn: [],
    createdAt: stamp,
    updatedAt: stamp,
  });
  await ctx.schedule('kvcoder.session.prune', {}, { cron: '0 3 * * *', key: 'session-prune' });
  await firePoint(ctx, 'kvcoder.session.created', { sessionId: session.id });
  return session;
}

/**
 * Deletes a session and its subagent sessions (plan 08 §8.1; ADR 0052, 3): each is marked `deleting`, which refuses new
 * steps under it, its turn is cancelled and its processes and runs stopped, and only then are its records deleted.
 * A delete that was cut short is finished by deleting again.
 */
export async function deleteSessionTree(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  await store.sessions.update(sessionId, { deleting: true });
  await cancelTurn(ctx, sessionId, false);
  await dropProcesses(ctx, sessionId);
  await dropRuns(ctx, sessionId);
  for (let children = await store.sessions.find({ parentId: sessionId }, { limit: 1000 }); children.length > 0; children = await store.sessions.find({ parentId: sessionId }, { limit: 1000 })) {
    for (const child of children) await deleteSessionTree(ctx, child.id);
  }
  for (const collection of [store.messages, store.queued, store.sendReceipts, store.answerReceipts, store.stepIntents, store.fileViews, store.fileBackups, store.fileChanges, store.fileParts, store.turns, store.questions, store.background, store.sections, store.artifacts, store.maps]) {
    for (let found = await collection.find({ sessionId }, { limit: 1000 }); found.length > 0; found = await collection.find({ sessionId }, { limit: 1000 })) {
      for (const document of found) await collection.delete(document.id);
    }
  }
  await store.sessions.delete(sessionId);
}
