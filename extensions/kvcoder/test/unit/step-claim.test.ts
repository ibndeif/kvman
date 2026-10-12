import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z, type Job } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { sessionDocSchema, stepIntentDocSchema, turnDocSchema, type SessionDoc, type TurnDoc } from '../../src/schemas/records.ts';
import { isLegacyStepJob, stepInputSchema, type StepInput } from '../../src/turns/step-claim.ts';
import { gateCode } from '../support/todo-extension.ts';

const oldInput = { sessionId: 'session', turnId: 'turn' };
const modern = { ...oldInput, intentId: 'intent', generation: 1 };
const job: Job = {
  id: '0192e0a0-0000-7000-8000-000000000000', name: 'kvcoder.turn.step', input: oldInput,
  workspaceId: 'workspace', caller: { kind: 'kernel' }, status: 'running', attempts: 1, retries: 0,
  createdAt: '2026-01-01T00:00:00.000Z', startedAt: '2026-01-01T00:00:00.000Z',
};

describe('private step input', () => {
  it('retains exactly the actual old shape and accepts complete modern identity', () => {
    expect(stepInputSchema.parse(oldInput)).toEqual(oldInput);
    expect(stepInputSchema.parse(modern)).toEqual(modern);
    const last = stepInputSchema.parse({ ...modern, generation: Number.MAX_SAFE_INTEGER });
    if (!('generation' in last)) throw new Error('Expected modern identity');
    expect(last.generation).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each([
    {}, { sessionId: 'session' }, { turnId: 'turn' }, { ...oldInput, intentId: 'intent' },
    { ...oldInput, generation: 1 }, { ...oldInput, extra: true }, { ...modern, extra: true },
    { ...modern, intentId: undefined }, { ...modern, generation: undefined },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1', null].map(generation => ({ ...modern, generation })),
  ])('rejects partial, mixed, extra or unsafe input: %j', input => {
    expect(stepInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('legacy immutable job metadata', () => {
  it('accepts only its exact first running invocation', () => {
    expect(isLegacyStepJob(job, oldInput, job.id, job.workspaceId)).toBe(true);
    expect(isLegacyStepJob(job, oldInput, 'another-id', job.workspaceId)).toBe(false);
    expect(isLegacyStepJob(job, oldInput, job.id, 'another-workspace')).toBe(false);
  });
  it.each<Partial<Job>>([
    { id: 'other' }, { name: 'kvcoder.other' }, { workspaceId: 'other' },
    { status: 'queued' }, { status: 'succeeded' }, { status: 'failed' }, { status: 'cancelled' },
    { attempts: 0 }, { attempts: 2 }, { retries: 1 },
    { input: { ...oldInput, sessionId: 'other' } }, { input: { ...oldInput, turnId: 'other' } },
    { input: modern }, { input: { ...oldInput, extra: true } }, { input: null },
  ])('rejects unverifiable metadata: %j', patch => {
    expect(isLegacyStepJob({ ...job, ...patch }, oldInput, job.id, job.workspaceId)).toBe(false);
  });
});

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { records, txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, pendingSchema } from ${source('schemas/records.ts')};
const sessionPatch = z.strictObject({ status: z.enum(['idle', 'running', 'waiting']).optional(), turnId: z.string().nullable().optional(), stepJobId: z.string().nullable().optional(), stepIntentId: z.string().nullable().optional(), stepGeneration: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() });
const turnPatch = z.strictObject({ sessionId: z.string().optional(), outcome: z.enum(['done', 'cancelled', 'failed', 'interrupted', 'maxSteps']).nullable().optional(), endedAt: z.string().nullable().optional(), pending: z.array(pendingSchema).optional() });
import { stepInputSchema, claimStepInput, type StepInput } from ${source('turns/step-claim.ts')};
import { prepareStep } from ${source('turns/step-intents.ts')};
const ids = z.strictObject({ sessionId: z.string(), turnId: z.string() });
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
${gateCode}
  const common = { public: true, output: z.unknown(), description: 'Isolated claim fixture.' };
  ctx.registerCommand('kvcoder.claimcheck.seed', { ...common, input: z.strictObject({}), handle: () => ctx.store.transaction(tx => {
    const r = txRecords(tx), timestamp = new Date().toISOString();
    // Save actual pre-upgrade fields; modern readers supply defaults, not execution authority.
    const s = tx.collection('sessions', sessionDocSchema.omit({ stepGeneration: true, stepIntentId: true })).insert({ title: 'seed', autoTitle: false, status: 'running', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: timestamp, updatedAt: timestamp });
    const t = r.turns.insert({ sessionId: s.id, startedAt: timestamp, endedAt: null, durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [] });
    tx.collection('sessions', sessionDocSchema.omit({ stepGeneration: true, stepIntentId: true })).update(s.id, { turnId: t.id });
    return { sessionId: s.id, turnId: t.id };
  }) });
  ctx.registerCommand('kvcoder.claimcheck.prepare', { ...common, input: ids, handle: input => ctx.store.transaction(tx => prepareStep(txRecords(tx), input.sessionId, input.turnId)) });
  ctx.registerCommand('kvcoder.claimcheck.patch', { ...common, input: ids.extend({ session: sessionPatch.optional(), turn: turnPatch.optional() }), handle: input => ctx.store.transaction(tx => {
    const r = txRecords(tx); if (input.session) r.sessions.update(input.sessionId, input.session); if (input.turn) r.turns.update(input.turnId, input.turn); return {};
  }) });
  ctx.registerCommand('kvcoder.claimcheck.bindlegacy', { ...common, input: ids.extend({ jobId: z.string() }), handle: input => ctx.store.transaction(tx => {
    tx.collection('sessions', sessionDocSchema.omit({ stepGeneration: true, stepIntentId: true })).update(input.sessionId, { stepJobId: input.jobId });
    return tx.collection('sessions', z.record(z.string(), z.json())).get(input.sessionId);
  }) });
  ctx.registerCommand('kvcoder.claimcheck.boundary', { ...common, input: z.strictObject({ stage: z.enum(['before', 'lookup', 'transaction', 'error']), input: stepInputSchema }), handle: async ({ stage, input }) => {
    const controller = new AbortController(), reason = new Error('claim-boundary');
    let lookups = 0, transactions = 0;
    if (stage === 'before') controller.abort(reason);
    const local: Ctx = { ...ctx, job: { ...ctx.job, signal: controller.signal },
      exec: (...args) => { lookups++; if (stage === 'error') throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'claim-lookup-failed' }); if (stage === 'lookup') controller.abort(reason); return ctx.exec(...args); },
      store: { ...ctx.store, transaction: handle => { transactions++; return ctx.store.transaction(tx => { if (stage === 'transaction') controller.abort(reason); return handle(tx); }); } },
    };
    try { await claimStepInput(local, input); return { rejected: false, lookups, transactions }; }
    catch (error) { return { rejected: true, sameReason: error === reason, code: error instanceof ProblemError ? error.problem.code : null, lookups, transactions }; }
  } });
  const execute = async (input: StepInput) => {
    const lease = await claimStepInput(ctx, input);
    if (lease) await ctx.store.transaction(tx => {
      const r = txRecords(tx), t = r.turns.get(input.turnId); if (!t) throw new Error('missing turn');
      r.turns.update(t.id, { steps: t.steps + 1 });
    });
    // A repeat invocation in the same job must also lose before simulated effects.
    const repeated = await claimStepInput(ctx, input);
    if (repeated) throw new Error('duplicate execution authority');
    return { lease: lease ?? null, repeated: repeated === undefined };
  };
  ctx.registerCommand('kvcoder.claimcheck.claim', { ...common, input: stepInputSchema, handle: execute });
  ctx.registerCommand('kvcoder.turn.step', { description: 'Actual queued old step.', input: stepInputSchema, output: z.unknown(), retries: 0,
    handle: async input => { await gate(input.sessionId); return execute(input); } });
  ctx.registerQuery('kvcoder.claimcheck.snapshot', { ...common, input: ids, handle: async input => {
    const r = records(ctx.store); return { session: await r.sessions.get(input.sessionId), turn: await r.turns.get(input.turnId), intents: await r.stepIntents.find({ sessionId: input.sessionId }, { limit: 1000 }) };
  } });
};
`;
const idsSchema = z.strictObject({ sessionId: z.string(), turnId: z.string() });
const resultSchema = z.object({ lease: z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number(), jobId: z.string() }).nullable(), repeated: z.boolean() });
const snapshotSchema = z.object({ session: sessionDocSchema.extend({ id: z.string() }), turn: turnDocSchema.extend({ id: z.string() }), intents: z.array(stepIntentDocSchema.extend({ id: z.string() })) });
const pending: TurnDoc['pending'] = [{ toolCallId: 'approval', kind: 'approval', questionId: null, question: null, childSessionId: null, runId: null }];

describe('claim wrapper with native SQLite and real Ctx', () => {
  let kernel: TestKernel | undefined;
  let root: string | undefined;
  let ids: z.output<typeof idsSchema>;
  const gates: { release(): void; close(): void }[] = [];
  const active = () => { if (!kernel) throw new Error('kernel not started'); return kernel; };
  const patch = (session: Partial<SessionDoc> = {}, turn: Partial<TurnDoc> = {}) => active().exec('kvcoder.claimcheck.patch', { ...ids, session, turn });
  const snapshot = async () => snapshotSchema.parse(await active().exec('kvcoder.claimcheck.snapshot', ids));
  const prepare = async () => stepInputSchema.parse(await active().exec('kvcoder.claimcheck.prepare', ids));
  const claim = async (input: StepInput) => resultSchema.parse(await active().exec('kvcoder.claimcheck.claim', input));
  const queued = async () => {
    const ready = new BroadcastChannel(ids.sessionId + ':ready');
    const release = new BroadcastChannel(ids.sessionId);
    const waiting = new Promise<void>(resolve => { ready.onmessage = () => { ready.close(); resolve(); }; });
    const gate = { release: () => release.postMessage('go'), close: () => { ready.close(); release.close(); } };
    gates.push(gate);
    const jobId = await active().execAsync('kvcoder.turn.step', ids, { as: '@test/kvcoderclaims' });
    await waiting;
    return { jobId, release: gate.release };
  };
  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'kvcoderclaims-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/kvcoderclaims', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'kvcoder', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    ids = idsSchema.parse(await active().exec('kvcoder.claimcheck.seed', {}));
  });
  afterEach(async () => {
    for (const gate of gates) { gate.release(); gate.close(); }
    gates.length = 0;
    try { await kernel?.close(); } finally {
      kernel = undefined; if (root) rmSync(root, { recursive: true, force: true }); root = undefined;
    }
  });

  it('modern duplicate and concurrent candidates cause one simulated effect, not two', async () => {
    const input = await prepare();
    const results = await Promise.all([claim(input), claim(input)]);
    const winners = results.filter(result => result.lease !== null);
    expect(winners).toHaveLength(1); expect(results.every(result => result.repeated)).toBe(true);
    const state = await snapshot();
    expect(state.turn.steps).toBe(1);
    expect(state.session.stepJobId).toBe(winners[0]?.lease?.jobId);
    expect(state.intents).toEqual([expect.objectContaining({ phase: 'claimed', jobId: state.session.stepJobId })]);
    const before = await snapshot(); expect((await claim(input)).lease).toBeNull(); expect(await snapshot()).toEqual(before);
  });
  it('rejects stale identity without consuming the prepared intent', async () => {
    const input = await prepare(); if (!('intentId' in input)) throw new Error('modern expected');
    for (const stale of [{ ...input, generation: input.generation + 1 }, { ...input, intentId: 'stale' }, { ...input, turnId: 'stale' }, { ...input, sessionId: 'stale' }]) {
      expect((await claim(stale)).lease).toBeNull();
    }
    expect((await snapshot()).turn.steps).toBe(0); expect((await claim(input)).lease).not.toBeNull();
  });
  it.each([
    { session: { status: 'waiting' as const } }, { turn: { pending } },
    { turn: { outcome: 'done' as const } }, { turn: { endedAt: '2026-01-01T00:00:00.000Z' } },
    { session: { turnId: 'different' } },
  ])('modern claim rechecks runnable current state: %j', async change => {
    const input = await prepare(); await patch(change.session, change.turn); const before = await snapshot();
    expect((await claim(input)).lease).toBeNull(); expect(await snapshot()).toEqual(before);
  });
  it('missing current job row is NOT_FOUND, not a legacy replay permit', async () => {
    const before = await snapshot(); expect((await claim(ids)).lease).toBeNull(); expect(await snapshot()).toEqual(before);
  });
  it('claims the actually saved legacy job atomically and suppresses its repeated invocation', async () => {
    const queuedJob = await queued();
    const raw = await active().exec('kvcoder.claimcheck.bindlegacy', { ...ids, jobId: queuedJob.jobId });
    expect(raw).not.toHaveProperty('stepGeneration'); expect(raw).not.toHaveProperty('stepIntentId');
    const known = await active().exec('kernel.jobs.get', { id: queuedJob.jobId });
    expect(known).toMatchObject({ name: 'kvcoder.turn.step', input: ids, status: 'running', attempts: 1, retries: 0 });
    queuedJob.release();
    const finished = await active().waitForJob(queuedJob.jobId);
    expect(finished.status).toBe('succeeded');
    expect(resultSchema.parse(finished.output)).toMatchObject({ lease: { ...ids, jobId: queuedJob.jobId, generation: 1 }, repeated: true });
    const state = await snapshot(); expect(state.turn.steps).toBe(1);
    expect(state.session).toMatchObject({ stepJobId: queuedJob.jobId, stepGeneration: 1 });
    expect(state.intents).toEqual([expect.objectContaining({ phase: 'claimed', legacyJobId: queuedJob.jobId, jobId: queuedJob.jobId })]);
  });
  it.each([
    { session: { stepJobId: null } }, { session: { stepJobId: 'different-job' } },
    { session: { status: 'waiting' as const } }, { session: { stepIntentId: 'active-intent' } },
    { session: { turnId: 'different-turn' } }, { turn: { sessionId: 'different-session' } },
    { turn: { pending } }, { turn: { outcome: 'done' as const } },
    { turn: { endedAt: '2026-01-01T00:00:00.000Z' } },
  ])('legacy defaults cannot bypass invalid mutable binding: %j', async change => {
    const queuedJob = await queued(); await patch({ stepJobId: queuedJob.jobId });
    await patch(change.session, change.turn); const before = await snapshot(); queuedJob.release();
    const finished = await active().waitForJob(queuedJob.jobId);
    expect(finished.status).toBe('succeeded'); expect(resultSchema.parse(finished.output).lease).toBeNull();
    expect(await snapshot()).toEqual(before); expect(before.intents).toHaveLength(0); expect(before.turn.steps).toBe(0);
  });
  it.each(['before', 'lookup', 'transaction'] as const)('preserves exact cancellation at the %s boundary without consuming an intent', async stage => {
    const input = stage === 'transaction' ? await prepare() : ids;
    const before = await snapshot();
    expect(await active().exec('kvcoder.claimcheck.boundary', { stage, input })).toEqual({ rejected: true, sameReason: true, code: null, lookups: stage === 'lookup' ? 1 : 0, transactions: stage === 'transaction' ? 1 : 0 });
    expect(await snapshot()).toEqual(before);
  });
  it('does not swallow an operational lookup failure as a missing legacy job', async () => {
    const before = await snapshot();
    expect(await active().exec('kvcoder.claimcheck.boundary', { stage: 'error', input: ids })).toEqual({ rejected: true, sameReason: false, code: 'VALIDATION_FAILED', lookups: 1, transactions: 0 });
    expect(await snapshot()).toEqual(before);
  });
  it('legacy preparation overflow rolls back without creating an intent or effect', async () => {
    const queuedJob = await queued(); await patch({ stepJobId: queuedJob.jobId, stepGeneration: Number.MAX_SAFE_INTEGER });
    const before = await snapshot(); queuedJob.release();
    expect(await active().waitForJob(queuedJob.jobId)).toMatchObject({ status: 'failed', problem: { code: 'VALIDATION_FAILED' } });
    expect(await snapshot()).toEqual(before);
  });
});
