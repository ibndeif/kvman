import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobSchema, z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../src/schemas/records.ts';
import { openGate } from './support/gates.ts';

const source = (file: string) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href);
const identitySchema = z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() });
const stateSchema = z.object({ session: sessionDocSchema.extend({ id: z.string() }), turn: turnDocSchema.extend({ id: z.string() }), intents: z.array(stepIntentDocSchema.extend({ id: z.string() })) });
// Uses real dispatch/claim/advance/end/cancel helpers in native worker jobs. The consumer has no model;
// its gate represents post-commit work, so cancellation of a settled winner is observable, not a timing guess.
const entry = `
import { z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { openTurn, dispatchStep } from ${source('turns/start-turn.ts')};
import { preparedStep } from ${source('turns/step-intents.ts')};
import { claimStepInput, stepInputSchema } from ${source('turns/step-claim.ts')};
import { endTurnState } from ${source('turns/end-turn-state.ts')};
import { advanceStep } from ${source('turns/step-next.ts')};
import { cancelTurn } from ${source('turns/end-turn.ts')};
const controlSchema = z.object({ sessionId: z.string(), mode: z.enum(['end', 'successor', 'cancel']) });
const ids = z.object({ sessionId: z.string(), turnId: z.string() });
export default (ctx: Ctx): void => {
  const gate = (name: string) => new Promise<void>(resolve => {
    const channel = new BroadcastChannel(name), signal = ctx.job.signal;
    const finish = () => { channel.close(); signal.removeEventListener('abort', finish); resolve(); };
    channel.onmessage = finish;
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) { finish(); return; }
    const ready = new BroadcastChannel(name + ':ready'); ready.postMessage('ready'); ready.close();
  });
  const common = { public: true, description: 'Isolated publication fixture.', output: z.unknown() };
  ctx.registerCommand('kvcoder.pubcheck.seed', { ...common, input: z.object({ mode: controlSchema.shape.mode }), handle: ({ mode }) => ctx.store.transaction(tx => {
    const r = txRecords(tx), timestamp = new Date().toISOString();
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const s = r.sessions.insert({ title: 'seed', autoTitle: false, status: 'idle', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: timestamp, updatedAt: timestamp });
    const turnId = openTurn(r, s);
    tx.collection('publication-controls', controlSchema).insert({ sessionId: s.id, mode });
    return { sessionId: s.id, turnId };
  }) });
  ctx.registerCommand('kvcoder.pubcheck.dispatch', { ...common, input: ids, handle: async ({ sessionId, turnId }) => {
    const identity = await ctx.store.transaction(tx => preparedStep(txRecords(tx), sessionId, turnId));
    if (!identity) throw new Error('Prepared identity missing');
    const delayed: Ctx = { ...ctx, execAsync: async (...args) => {
      const jobId = await ctx.execAsync(...args);
      await gate(sessionId + ':publisher');
      return jobId;
    } };
    return { jobId: await dispatchStep(delayed, identity, true) };
  } });
  ctx.registerCommand('kvcoder.turn.step', { description: 'Real claim/settlement with gated post-commit work.', input: stepInputSchema, output: z.object({}), retries: 0,
    handle: async input => {
      const lease = await claimStepInput(ctx, input);
      if (!lease) return {};
      const [control] = await ctx.store.collection('publication-controls', controlSchema).find({ sessionId: input.sessionId }, { limit: 1 });
      if (!control) throw new Error('Control missing');
      if (control.mode !== 'cancel') await ctx.store.transaction(tx => {
        if (control.mode === 'end') endTurnState(txRecords(tx), input.sessionId, input.turnId, 'done', 'step', undefined, lease);
        else advanceStep(txRecords(tx), lease, null);
      });
      await gate(input.sessionId + ':consumer');
      ctx.job.signal.throwIfAborted();
      return {};
    } });
  ctx.registerCommand('kvcoder.pubcheck.cancel', { ...common, input: ids, handle: ({ sessionId }) => cancelTurn(ctx, sessionId, false) });
  ctx.registerQuery('kvcoder.pubcheck.snapshot', { ...common, input: ids, handle: input => ctx.store.transaction(tx => {
    const r = txRecords(tx);
    return { session: r.sessions.get(input.sessionId), turn: r.turns.get(input.turnId), intents: r.stepIntents.find({ sessionId: input.sessionId }, { limit: 1000 }) };
  }) });
};
`;

async function withWorld(mode: 'end' | 'successor' | 'cancel', run: (kernel: TestKernel, ids: { sessionId: string; turnId: string }) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-publication-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/publication', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'kvcoder', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    const ids = identitySchema.pick({ sessionId: true, turnId: true }).parse(await kernel.exec('kvcoder.pubcheck.seed', { mode }));
    await run(kernel, ids);
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

const snapshot = async (kernel: TestKernel, ids: { sessionId: string; turnId: string }) => stateSchema.parse(await kernel.exec('kvcoder.pubcheck.snapshot', ids));

describe('delayed real publication (ADR0041 E77–E80)', () => {
  it.each(['end', 'successor'] as const)('does not cancel a settled canonical winner after %s while its post-commit work still runs', async mode => {
    await withWorld(mode, async (kernel, ids) => {
      const publisher = openGate(ids.sessionId + ':publisher'), consumer = openGate(ids.sessionId + ':consumer');
      try {
        const rootJob = await kernel.execAsync('kvcoder.pubcheck.dispatch', ids);
        await Promise.all([publisher.waiting, consumer.waiting]);
        const before = await snapshot(kernel, ids);
        const first = before.intents[0];
        if (!first?.jobId) throw new Error('Canonical winner missing');
        expect(first.phase).toBe('settled');
        expect(jobSchema.parse(await kernel.exec('kernel.jobs.get', { id: first.jobId })).status).toBe('running');
        expect(before.session).toMatchObject(mode === 'end' ? { status: 'idle', stepIntentId: null, stepGeneration: 1 } : { status: 'running', stepIntentId: before.intents[1]?.id, stepGeneration: 2 });
        publisher.release();
        expect(await kernel.waitForJob(rootJob)).toMatchObject({ status: 'succeeded', output: { jobId: null } });
        expect(await snapshot(kernel, ids)).toEqual(before);
        expect(jobSchema.parse(await kernel.exec('kernel.jobs.get', { id: first.jobId })).status).toBe('running');
        consumer.release();
        expect((await kernel.waitForJob(first.jobId)).status).toBe('succeeded');
      } finally { publisher.release(); consumer.release(); }
    });
  });
  it('invalidates and stops the claimed winner before a delayed publisher can resurrect its pointer', async () => {
    await withWorld('cancel', async (kernel, ids) => {
      const publisher = openGate(ids.sessionId + ':publisher'), consumer = openGate(ids.sessionId + ':consumer');
      try {
        const rootJob = await kernel.execAsync('kvcoder.pubcheck.dispatch', ids);
        await Promise.all([publisher.waiting, consumer.waiting]);
        const before = await snapshot(kernel, ids), first = before.intents[0];
        if (!first?.jobId) throw new Error('Claimed winner missing');
        expect(first.phase).toBe('claimed');
        expect(await kernel.exec('kvcoder.pubcheck.cancel', ids)).toBe(true);
        expect((await kernel.waitForJob(first.jobId)).status).toBe('cancelled');
        const cancelled = await snapshot(kernel, ids);
        expect(cancelled.intents[0]).toMatchObject({ phase: 'invalidated', reason: 'CANCEL_REQUESTED', jobId: first.jobId });
        publisher.release();
        expect(await kernel.waitForJob(rootJob)).toMatchObject({ status: 'succeeded', output: { jobId: null } });
        expect(await snapshot(kernel, ids)).toEqual(cancelled);
      } finally { publisher.release(); consumer.release(); }
    });
  });
});
