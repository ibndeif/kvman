import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { sessionDocSchema, stepIntentDocSchema, turnDocSchema, type SessionDoc, type TurnDoc } from '../../src/schemas/records.ts';
import type { StepIdentity } from '../../src/turns/step-intents.ts';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const identitySchema = z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() });
const snapshotSchema = z.object({ session: sessionDocSchema.extend({ id: z.string() }), turn: turnDocSchema.extend({ id: z.string() }), intents: z.array(stepIntentDocSchema.extend({ id: z.string() })) });
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { txRecords, records, type TxRecords } from ${source('store/collections.ts')};
import { pendingSchema } from ${source('schemas/records.ts')};
const sessionPatch = z.strictObject({ status: z.enum(['idle', 'running', 'waiting']).optional(), turnId: z.string().nullable().optional(), stepJobId: z.string().nullable().optional(), stepIntentId: z.string().nullable().optional(), stepGeneration: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() });
const turnPatch = z.strictObject({ sessionId: z.string().optional(), outcome: z.enum(['done', 'cancelled', 'failed', 'interrupted', 'maxSteps']).nullable().optional(), endedAt: z.string().nullable().optional(), pending: z.array(pendingSchema).optional() });
import { prepareStep, claimStep, publishStep, liveStep, settleStep, invalidateStep } from ${source('turns/step-intents.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
const pending = [{ toolCallId: 'approval-1', kind: 'approval', questionId: null, question: null, childSessionId: null, runId: null }];
const turn = (r: TxRecords, sessionId: string) => r.turns.insert({ sessionId, startedAt: new Date().toISOString(), endedAt: null, durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [] });
export default (ctx: Ctx): void => {
  const common = { public: true, output: z.unknown() };
  ctx.registerCommand('intentchecks.seed', { ...common, description: 'Seeds valid native records.', input: z.object({ generation: z.number().default(0) }),
    handle: ({ generation }) => ctx.store.transaction(tx => {
      const r = txRecords(tx), timestamp = new Date().toISOString();
      const s = r.sessions.insert({ title: 'seed', autoTitle: false, status: 'running', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepIntentId: null, stepGeneration: generation, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: timestamp, updatedAt: timestamp });
      const t = turn(r, s.id); r.sessions.update(s.id, { turnId: t.id });
      return { sessionId: s.id, turnId: t.id };
    }) });
  ctx.registerCommand('intentchecks.exercise', { ...common, description: 'Exercises actual intent primitives inside SQLite.',
    input: z.object({ op: z.enum(['prepare', 'claim', 'publish', 'write', 'waiting', 'end', 'successor', 'new-turn', 'invalidate', 'patch']), sessionId: z.string(), turnId: z.string(), identity: z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() }).optional(), jobId: z.string().default('job-a'), legacyJobId: z.string().nullable().default(null), rollback: z.boolean().default(false), effect: z.boolean().default(false), reason: z.enum(['CANCEL_REQUESTED', 'TURN_ENDED']).default('CANCEL_REQUESTED'), session: sessionPatch.optional(), turn: turnPatch.optional() }),
    handle: input => ctx.store.transaction(tx => {
      const r = txRecords(tx);
      const run = () => {
        if (input.op === 'prepare') return prepareStep(r, input.sessionId, input.turnId, input.legacyJobId);
        if (input.op === 'patch') { if (input.session) r.sessions.update(input.sessionId, input.session); if (input.turn) r.turns.update(input.turnId, input.turn); return true; }
        if (input.op === 'invalidate') { if (!input.identity) throw new Error('identity required'); return invalidateStep(r, input.identity, input.reason); }
        if (input.op === 'new-turn') {
          const t = turn(r, input.sessionId); r.sessions.update(input.sessionId, { turnId: t.id, status: 'running' });
          return prepareStep(r, input.sessionId, t.id);
        }
        const expected = input.identity; if (!expected) throw new Error('identity required');
        if (input.op === 'publish') return publishStep(r, expected, input.jobId);
        if (input.op === 'claim') {
          const won = claimStep(r, expected, input.jobId);
          if (won && input.effect) r.turns.update(won.turn.id, { steps: won.turn.steps + 1 });
          return won !== undefined;
        }
        if (input.op === 'write') {
          const live = liveStep(r, expected, input.jobId); if (!live) return false;
          r.sessions.update(live.session.id, { title: 'accepted-write' }); return true;
        }
        if (!settleStep(r, expected, input.jobId)) return false;
        if (input.op === 'waiting') { r.sessions.update(input.sessionId, { status: 'waiting' }); r.turns.update(input.turnId, { pending }); }
        if (input.op === 'end') { r.sessions.update(input.sessionId, { status: 'idle', turnId: null }); r.turns.update(input.turnId, { outcome: 'done', endedAt: new Date().toISOString() }); }
        if (input.op === 'successor') return prepareStep(r, input.sessionId, input.turnId);
        return true;
      };
      const result = run(); if (input.rollback) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'intent-test-rollback' }); return result;
    }) });
  ctx.registerQuery('intentchecks.snapshot', { ...common, description: 'Reads committed records.', input: z.object({ sessionId: z.string(), turnId: z.string() }),
    handle: async input => { const r = records(ctx.store); return { session: await r.sessions.get(input.sessionId), turn: await r.turns.get(input.turnId), intents: await r.stepIntents.find({ sessionId: input.sessionId }, { limit: 1000 }) }; } });
};
`;

type Exercise = { op: 'prepare' | 'claim' | 'publish' | 'write' | 'waiting' | 'end' | 'successor' | 'new-turn' | 'invalidate' | 'patch'; identity?: StepIdentity; jobId?: string; legacyJobId?: string | null; rollback?: boolean; effect?: boolean; reason?: 'CANCEL_REQUESTED' | 'TURN_ENDED'; session?: Partial<SessionDoc>; turn?: Partial<TurnDoc> };
let kernel: TestKernel | undefined;
let root: string | undefined;
let ids: { sessionId: string; turnId: string };
afterEach(async () => {
  try { await kernel?.close(); } finally { kernel = undefined; if (root) rmSync(root, { recursive: true, force: true }); root = undefined; }
});
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'intentchecks-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/intentchecks', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'intentchecks', source: 'index.ts', dependencies: {} } }));
  writeFileSync(path.join(root, 'index.ts'), entry);
  kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 4 } });
  ids = z.object({ sessionId: z.string(), turnId: z.string() }).parse(await kernel.exec('intentchecks.seed', {}));
});
const activeKernel = () => { if (!kernel) throw new Error('kernel not started'); return kernel; };
const exercise = (input: Exercise) => activeKernel().exec('intentchecks.exercise', { ...ids, ...input });
const snapshot = async () => snapshotSchema.parse(await activeKernel().exec('intentchecks.snapshot', ids));
const prepare = async (legacyJobId: string | null = null) => identitySchema.parse(await exercise({ op: 'prepare', legacyJobId }));
const claimed = async () => { const identity = await prepare(); expect(await exercise({ op: 'claim', identity })).toBe(true); return identity; };
const pending: TurnDoc['pending'] = [{ toolCallId: 'approval-1', kind: 'approval', questionId: null, question: null, childSessionId: null, runId: null }];

describe('step intent native SQLite transactions', () => {
  it('prepares exactly one identity and advances the safe generation once', async () => {
    const identity = await prepare();
    expect(identity).toMatchObject({ ...ids, generation: 1 });
    const before = await snapshot();
    expect(before.session).toMatchObject({ stepGeneration: 1, stepIntentId: identity.intentId, stepJobId: null });
    expect(before.intents).toEqual([expect.objectContaining({ id: identity.intentId, phase: 'prepared', jobId: null, generation: 1 })]);
    await expect(prepare()).rejects.toBeDefined(); expect(await snapshot()).toEqual(before);
  });
  it.each([
    { session: { status: 'waiting' as const } }, { session: { turnId: 'other-turn' } },
    { turn: { outcome: 'done' as const } }, { turn: { sessionId: 'other-session' } }, { turn: { pending } },
  ])('rejects non-runnable preparation: %j', async patch => {
    await exercise({ op: 'patch', ...patch }); const before = await snapshot();
    await expect(prepare()).rejects.toBeDefined(); expect(await snapshot()).toEqual(before);
  });
  it('allows the last safe generation and rolls back overflow without another intent', async () => {
    await exercise({ op: 'patch', session: { stepGeneration: Number.MAX_SAFE_INTEGER - 1 } });
    const identity = await claimed(); expect(identity.generation).toBe(Number.MAX_SAFE_INTEGER);
    await exercise({ op: 'end', identity }); await exercise({ op: 'patch', session: { status: 'running', turnId: ids.turnId }, turn: { outcome: null, endedAt: null } });
    const before = await snapshot(); await expect(prepare()).rejects.toBeDefined(); expect(await snapshot()).toEqual(before);
  });
  it('rolls back prepared record and session generation atomically', async () => {
    const before = await snapshot(); await expect(exercise({ op: 'prepare', rollback: true })).rejects.toThrow('intent-test-rollback');
    expect(await snapshot()).toEqual(before); expect((await prepare()).generation).toBe(1);
  });
  it('rolls back a claim and simulated effect, leaving the identity claimable', async () => {
    const identity = await prepare(), before = await snapshot();
    await expect(exercise({ op: 'claim', identity, effect: true, rollback: true })).rejects.toThrow('intent-test-rollback');
    expect(await snapshot()).toEqual(before); expect(await exercise({ op: 'claim', identity, jobId: 'job-b' })).toBe(true);
  });
  it('concurrent native transactions have exactly one winner before effects', async () => {
    const identity = await prepare(), jobs = ['job-a', 'job-b', 'job-c', 'job-d'];
    const winners = await Promise.all(jobs.map(jobId => exercise({ op: 'claim', identity, jobId, effect: true })));
    expect(winners.filter(Boolean)).toHaveLength(1);
    const state = await snapshot(), winner = jobs[winners.indexOf(true)];
    expect(state.turn.steps).toBe(1); expect(state.session.stepJobId).toBe(winner);
    expect(state.intents[0]).toMatchObject({ phase: 'claimed', jobId: winner });
  });
  it('denies repeated own and other claims before simulated effects', async () => {
    const identity = await prepare(); expect(await exercise({ op: 'claim', identity, effect: true })).toBe(true);
    const before = await snapshot();
    for (const jobId of ['job-a', 'job-b']) expect(await exercise({ op: 'claim', identity, jobId, effect: true })).toBe(false);
    expect(await snapshot()).toEqual(before); expect(before.turn.steps).toBe(1);
  });
  it('claim-before-publication accepts only winner confirmation and cannot clobber ownership', async () => {
    const identity = await claimed(), before = await snapshot();
    expect(await exercise({ op: 'publish', identity, jobId: 'job-b' })).toBe(false);
    expect(await exercise({ op: 'publish', identity })).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it('publication selects one candidate and reverse/late publications cannot replace it', async () => {
    const identity = await prepare(); expect(await exercise({ op: 'publish', identity })).toBe(true);
    const before = await snapshot(); expect(await exercise({ op: 'publish', identity, jobId: 'job-b' })).toBe(false);
    expect(await exercise({ op: 'claim', identity, jobId: 'job-b' })).toBe(false); expect(await snapshot()).toEqual(before);
    expect(await exercise({ op: 'claim', identity })).toBe(true);
    expect(await exercise({ op: 'publish', identity, jobId: 'job-b' })).toBe(false);
    expect((await snapshot()).intents[0]).toMatchObject({ jobId: 'job-a', phase: 'claimed' });
  });
  it('legacy binding rejects mismatched publication and claim', async () => {
    const identity = await prepare('legacy-job'), before = await snapshot();
    for (const op of ['publish', 'claim'] as const) expect(await exercise({ op, identity })).toBe(false);
    expect(await snapshot()).toEqual(before); expect(await exercise({ op: 'claim', identity, jobId: 'legacy-job' })).toBe(true);
    expect((await snapshot()).intents[0]).toMatchObject({ jobId: 'legacy-job', legacyJobId: 'legacy-job' });
  });
  it('pending work blocks both publication and claim of an existing intent', async () => {
    const identity = await prepare(); await exercise({ op: 'patch', turn: { pending } }); const before = await snapshot();
    for (const op of ['publish', 'claim'] as const) expect(await exercise({ op, identity })).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
  it.each(['job', 'intent', 'generation', 'turn', 'session'] as const)('fences stale %s identity from writes, claims, publication and settlement', async field => {
    const current = await claimed(); let identity = current; let jobId = 'job-a';
    if (field === 'job') jobId = 'job-b';
    if (field === 'intent') identity = { ...current, intentId: 'old-intent' };
    if (field === 'generation') identity = { ...current, generation: current.generation - 1 };
    if (field === 'turn') identity = { ...current, turnId: 'old-turn' };
    if (field === 'session') identity = { ...current, sessionId: 'other-session' };
    const before = await snapshot();
    for (const op of ['write', 'claim', 'publish', 'waiting'] as const) expect(await exercise({ op, identity, jobId })).toBe(false);
    expect(await snapshot()).toEqual(before); expect(await exercise({ op: 'write', identity: current })).toBe(true);
  });
  it.each([
    { session: { stepJobId: 'job-b' } }, { session: { stepGeneration: 2 } }, { session: { stepIntentId: 'other-intent' } },
    { session: { turnId: 'other-turn' } }, { session: { status: 'idle' as const } },
    { turn: { sessionId: 'other-session' } }, { turn: { outcome: 'done' as const } },
  ])('rechecks current persisted state before a step-derived write: %j', async patch => {
    const identity = await claimed(); await exercise({ op: 'patch', ...patch }); const before = await snapshot();
    expect(await exercise({ op: 'write', identity })).toBe(false); expect(await snapshot()).toEqual(before);
  });
  it('settles with waiting state in one transaction and rejects the old identity', async () => {
    const identity = await claimed(); expect(await exercise({ op: 'waiting', identity })).toBe(true);
    const state = await snapshot(); expect(state.session).toMatchObject({ status: 'waiting', stepIntentId: null, stepJobId: null, stepGeneration: 1 });
    expect(state.turn.pending).toEqual(pending); expect(state.intents[0]).toMatchObject({ phase: 'settled', jobId: 'job-a' });
    for (const op of ['write', 'claim', 'publish', 'waiting'] as const) expect(await exercise({ op, identity })).toBe(false);
    expect(await snapshot()).toEqual(state);
  });
  it('settles the old intent and prepares its successor atomically', async () => {
    const old = await claimed(), next = identitySchema.parse(await exercise({ op: 'successor', identity: old }));
    expect(next).toMatchObject({ ...ids, generation: 2 }); expect(next.intentId).not.toBe(old.intentId);
    const before = await snapshot(); expect(before.intents.map(i => [i.id, i.phase])).toEqual(expect.arrayContaining([[old.intentId, 'settled'], [next.intentId, 'prepared']]));
    for (const op of ['write', 'publish', 'claim'] as const) expect(await exercise({ op, identity: old })).toBe(false);
    expect(await snapshot()).toEqual(before); expect(await exercise({ op: 'claim', identity: next, jobId: 'job-b' })).toBe(true);
  });
  it('rolls back settlement and successor together', async () => {
    const identity = await claimed(), before = await snapshot();
    await expect(exercise({ op: 'successor', identity, rollback: true })).rejects.toThrow('intent-test-rollback'); expect(await snapshot()).toEqual(before);
    expect(await exercise({ op: 'write', identity })).toBe(true);
  });
  it('retains generation across ended turns and fences the previous turn', async () => {
    const old = await claimed(); expect(await exercise({ op: 'end', identity: old })).toBe(true);
    expect((await snapshot()).turn.outcome).toBe('done'); const next = identitySchema.parse(await exercise({ op: 'new-turn' }));
    expect(next.generation).toBe(2); expect(next.turnId).not.toBe(old.turnId);
    expect((await snapshot()).session).toMatchObject({ turnId: next.turnId, stepGeneration: 2, stepIntentId: next.intentId });
    for (const op of ['write', 'publish', 'claim'] as const) expect(await exercise({ op, identity: old })).toBe(false);
    expect(await exercise({ op: 'claim', identity: next, jobId: 'job-b' })).toBe(true);
  });
  it('rolls back settlement and successor generation overflow together', async () => {
    await exercise({ op: 'patch', session: { stepGeneration: Number.MAX_SAFE_INTEGER - 1 } });
    const identity = await claimed(), before = await snapshot();
    await expect(exercise({ op: 'successor', identity })).rejects.toBeDefined();
    expect(await snapshot()).toEqual(before);
    expect(await exercise({ op: 'write', identity })).toBe(true);
  });
  it('retains a verified legacy job and returns it for cancellation before publication', async () => {
    const identity = await prepare('legacy-job');
    expect(await exercise({ op: 'invalidate', identity })).toBe('legacy-job');
    const before = await snapshot();
    expect(before.intents[0]).toMatchObject({ phase: 'invalidated', jobId: null, legacyJobId: 'legacy-job' });
    for (const op of ['publish', 'claim'] as const) expect(await exercise({ op, identity, jobId: 'legacy-job' })).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
  it('a delayed invalidation cannot cancel a successor in the same turn', async () => {
    const old = await claimed(), next = identitySchema.parse(await exercise({ op: 'successor', identity: old }));
    const before = await snapshot();
    expect(await exercise({ op: 'invalidate', identity: old })).toBeNull();
    expect(await snapshot()).toEqual(before);
    expect(await exercise({ op: 'claim', identity: next, jobId: 'job-b' })).toBe(true);
  });
  it.each(['intent', 'generation', 'turn', 'session'] as const)('invalidating stale %s cannot affect current prepared identity', async field => {
    const current = await prepare(); let identity = current;
    if (field === 'intent') identity = { ...current, intentId: 'old-intent' };
    if (field === 'generation') identity = { ...current, generation: 0 };
    if (field === 'turn') identity = { ...current, turnId: 'old-turn' };
    if (field === 'session') identity = { ...current, sessionId: 'other-session' };
    const before = await snapshot();
    expect(await exercise({ op: 'invalidate', identity })).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
  it.each(['prepared', 'published', 'claimed'] as const)('invalidates %s intent, retains tracking, and rejects further operations', async phase => {
    const identity = await prepare(); if (phase === 'published') await exercise({ op: 'publish', identity });
    if (phase === 'claimed') await exercise({ op: 'claim', identity });
    const jobId = phase === 'prepared' ? null : 'job-a';
    expect(await exercise({ op: 'invalidate', identity, reason: 'TURN_ENDED' })).toBe(jobId);
    const before = await snapshot(); expect(before.session).toMatchObject({ stepIntentId: null, stepJobId: null, stepGeneration: 1 });
    expect(before.intents[0]).toMatchObject({ id: identity.intentId, phase: 'invalidated', jobId, reason: 'TURN_ENDED' });
    for (const op of ['claim', 'publish', 'write', 'waiting'] as const) expect(await exercise({ op, identity })).toBe(false);
    expect(await exercise({ op: 'invalidate', identity })).toBeNull(); expect(await snapshot()).toEqual(before);
  });
});
