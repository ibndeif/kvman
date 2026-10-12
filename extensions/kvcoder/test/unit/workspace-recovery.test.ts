import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../../src/schemas/records.ts';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const identity = z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() });
const snapshot = z.object({ session: sessionDocSchema.extend({ id: z.string() }), turn: turnDocSchema.extend({ id: z.string() }), intents: z.array(stepIntentDocSchema.extend({ id: z.string() })), notices: z.number() });
const result = z.object({ before: snapshot, after: snapshot, observed: snapshot, lookups: z.array(z.string()), enqueues: z.array(z.object({ name: z.string(), input: identity, id: z.string() })), cancels: z.array(z.string()), matches: z.boolean(), errorSame: z.boolean(), errorCode: z.string().nullable() });
const oldJob = '01900000-0000-7000-8000-000000000001';
const newJob = '01900000-0000-7000-8000-000000000002';
const entry = `
import { ProblemError, z, type Ctx, type Job, type InputOf, type OutputOf } from '@kvman/sdk';
import { records, txRecords } from ${source('store/collections.ts')};
import { recoverSession, recoverWorkspace, recoveryJobMatches } from ${source('turns/recover-workspace.ts')};
import { recoveryState } from ${source('turns/recovery-state.ts')};
import { prepareStep, publishStep, claimStep, invalidateStep, settleStep, liveStep } from ${source('turns/step-intents.ts')};
import { claimStepInput, stepInputSchema } from ${source('turns/step-claim.ts')};
const oldJob = '${oldJob}', newJob = '${newJob}';
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
  const common = { description: 'Isolated native recovery boundary fixture.', public: true, output: z.unknown() };
  const read = async (sessionId: string, turnId: string) => {
    const r = records(ctx.store);
    return { session: await r.sessions.get(sessionId), turn: await r.turns.get(turnId), intents: await r.stepIntents.find({ sessionId }, { limit: 1000 }), notices: await r.messages.count({ sessionId }) };
  };
  ctx.registerQuery('kvcoder.recoverycheck.snapshot', { ...common, input: z.object({ sessionId: z.string(), turnId: z.string() }), handle: i => read(i.sessionId, i.turnId) });
  ctx.registerCommand('kvcoder.turn.step', { description: 'Private claim-before-effect test consumer.', retries: 0, input: stepInputSchema, output: z.object({ won: z.boolean() }), handle: async input => {
    const lease = await claimStepInput(ctx, input);
    if (!lease) return { won: false };
    return ctx.store.transaction(tx => {
      const r = txRecords(tx), live = liveStep(r, lease, ctx.job.id);
      if (!live) return { won: false };
      r.turns.update(live.turn.id, { steps: live.turn.steps + 1 }); return { won: true };
    });
  } });
  ctx.registerCommand('kvcoder.recoverycheck.duplicate', { ...common, input: stepInputSchema, handle: input => ctx.execAsync('kvcoder.turn.step', input) });
  ctx.registerCommand('kvcoder.recoverycheck.run', { ...common, input: z.object({
    mode: z.enum(['prepared', 'claimed', 'legacy']).default('prepared'), status: z.enum(['queued', 'running', 'failed', 'succeeded', 'cancelled', 'missing']).default('queued'),
    fault: z.enum(['none', 'id', 'name', 'workspace', 'session', 'turn', 'intent', 'generation', 'extra', 'legacy-input', 'retries', 'attempts', 'operational', 'abort', 'pre-abort']).default('none'),
    transition: z.enum(['none', 'replace', 'settle', 'cancel']).default('none'), workspace: z.boolean().default(false), defer: z.boolean().default(false), consume: z.boolean().default(false), overflow: z.boolean().default(false),
  }), handle: async i => {
    const seeded = await ctx.store.transaction(tx => {
      const r = txRecords(tx), stamp = new Date().toISOString();
      const s = r.sessions.insert({ title: 'seed', autoTitle: false, status: 'running', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: i.overflow ? Number.MAX_SAFE_INTEGER : 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp });
      const t = r.turns.insert({ sessionId: s.id, startedAt: stamp, endedAt: null, durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [] });
      r.sessions.update(s.id, { turnId: t.id });
      if (i.mode === 'legacy') r.sessions.update(s.id, { stepJobId: oldJob });
      else { const id = prepareStep(r, s.id, t.id); if (i.mode === 'claimed') claimStep(r, id, oldJob); else publishStep(r, id, oldJob); }
      const state = recoveryState(r, s.id); if (!state) throw new Error('Seed must be recoverable'); return state;
    });
    const sid = seeded.session.id, tid = seeded.turn.id;
    const expected = seeded.intent ? { sessionId: sid, turnId: tid, intentId: seeded.intent.id, generation: seeded.intent.generation } : { sessionId: sid, turnId: tid };
    let input = expected;
    if (i.fault === 'session') input = { ...expected, sessionId: 'foreign-session' };
    if (i.fault === 'turn') input = { ...expected, turnId: 'foreign-turn' };
    if (i.fault === 'intent') input = { ...expected, intentId: 'foreign-intent' };
    if (i.fault === 'generation') input = { ...expected, generation: 2 };
    if (i.fault === 'extra') input = { ...expected, extra: true };
    if (i.fault === 'legacy-input') input = { sessionId: sid, turnId: tid };
    const metadata: Job = Object.freeze({ id: i.fault === 'id' ? newJob : oldJob, name: i.fault === 'name' ? 'foreign.step' : 'kvcoder.turn.step', workspaceId: i.fault === 'workspace' ? 'foreign-workspace' : ctx.job.workspace.id,
      input: Object.freeze(input), caller: { kind: 'extension', name: '@test/recoverycheck' }, status: i.status === 'missing' ? 'failed' : i.status,
      attempts: i.fault === 'attempts' ? (i.status === 'queued' ? 1 : 2) : i.status === 'queued' ? 0 : 1, retries: i.fault === 'retries' ? 1 : 0, createdAt: new Date().toISOString(),
      ...(i.status === 'failed' ? { problem: { code: 'STEP_FAILED', message: 'controlled terminal failure' } } : {}) });
    const before = await read(sid, tid); let observed = before;
    const controller = new AbortController(), failure = new ProblemError({ code: 'STORE_UNAVAILABLE', message: 'controlled metadata failure' }), aborted = new Error('controlled lookup abort');
    const lookups: string[] = [], enqueues: { name: string; input: typeof expected; id: string }[] = [], cancels: string[] = [];
    if (i.fault === 'pre-abort') controller.abort(aborted);
    const local: Ctx = { ...ctx, job: { ...ctx.job, signal: controller.signal },
      exec: async <Name extends string>(name: Name, request: InputOf<Name>): Promise<OutputOf<Name>> => {
        if (name !== 'kernel.jobs.get') return ctx.exec(name, request);
        lookups.push(z.object({ id: z.string() }).parse(request).id);
        if (i.transition !== 'none') {
          await ctx.store.transaction(tx => {
            const r = txRecords(tx), intent = seeded.intent; if (!intent) throw new Error('Transition requires modern intent');
            const id = { sessionId: sid, turnId: tid, intentId: intent.id, generation: intent.generation };
            if (i.transition === 'settle') settleStep(r, id, oldJob);
            else { invalidateStep(r, id, 'CANCEL_REQUESTED'); if (i.transition === 'replace') prepareStep(r, sid, tid); else { r.sessions.update(sid, { status: 'idle', turnId: null }); r.turns.update(tid, { outcome: 'cancelled', endedAt: new Date().toISOString() }); } }
          });
          observed = await read(sid, tid);
        }
        if (i.fault === 'operational') throw failure;
        if (i.fault === 'abort') controller.abort(aborted);
        if (i.status === 'missing') throw new ProblemError({ code: 'NOT_FOUND', message: 'controlled missing metadata' });
        return metadata as OutputOf<Name>;
      },
      execAsync: async (name, request) => { const parsed = stepInputSchema.parse(request); const id = i.consume ? await ctx.execAsync(name, request) : newJob; enqueues.push({ name, input: parsed, id }); return id; },
      cancel: async id => { cancels.push(id); },
    };
    let errorSame = false, errorCode: string | null = null;
    try { if (i.workspace) await recoverWorkspace(local, i.defer ? sid : undefined); else await recoverSession(local, sid, !i.defer); }
    catch (error) {
      if (error === failure || error === aborted) { errorSame = true; errorCode = error === failure ? failure.problem.code : 'ABORTED'; }
      else if (i.overflow && error instanceof ProblemError && error.problem.code === 'VALIDATION_FAILED') errorCode = error.problem.code;
      else throw error;
    }
    return { before, after: await read(sid, tid), observed, lookups, enqueues, cancels, matches: recoveryJobMatches(seeded, metadata, ctx.job.workspace.id), errorSame, errorCode };
  } });
};
`;

type Options = { mode?: 'prepared' | 'claimed' | 'legacy'; status?: 'queued' | 'running' | 'failed' | 'succeeded' | 'cancelled' | 'missing'; fault?: string; transition?: 'replace' | 'settle' | 'cancel'; workspace?: boolean; defer?: boolean; consume?: boolean; overflow?: boolean };
let kernel: TestKernel | undefined;
let root: string | undefined;
const active = () => { if (!kernel) throw new Error('Kernel missing'); return kernel; };
const run = async (options: Options = {}) => result.parse(await active().exec('kvcoder.recoverycheck.run', options));
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'workspace-recovery-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/recoverycheck', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'kvcoder', source: 'index.ts', dependencies: {} } }));
  writeFileSync(path.join(root, 'index.ts'), entry);
  kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
});
afterEach(async () => {
  try { await kernel?.close(); } finally { kernel = undefined; if (root) rmSync(root, { recursive: true, force: true }); root = undefined; }
});
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected fixture record');
  return item;
}
const noEffects = (r: z.output<typeof result>) => { expect(r.enqueues).toEqual([]); expect(r.cancels).toEqual([]); expect(r.errorCode).toBeNull(); };

describe('workspace recovery native SQLite/testkit boundary', () => {
  it.each([['prepared', 'queued'], ['prepared', 'running'], ['claimed', 'running'], ['legacy', 'queued'], ['legacy', 'running']] as const)('preserves exact %s/%s binding without manufacturing authority', async (mode, status) => {
    const r = await run({ mode, status }); noEffects(r); expect(r.matches).toBe(true); expect(r.lookups).toEqual([oldJob]); expect(r.after).toEqual(r.before);
    if (mode === 'legacy') expect(r.after.intents).toEqual([]);
  });
  it.each(['failed', 'succeeded', 'cancelled', 'missing'] as const)('redispatches modern prepared %s with the same identity', async status => {
    const r = await run({ status }); const intent = first(r.before.intents);
    expect(r.enqueues).toEqual([{ name: 'kvcoder.turn.step', input: { sessionId: r.before.session.id, turnId: r.before.turn.id, intentId: intent.id, generation: intent.generation }, id: newJob }]);
    expect(r.after.intents).toEqual([{ ...intent, jobId: newJob, updatedAt: first(r.after.intents).updatedAt }]);
    expect(r.after.session).toMatchObject({ status: 'running', stepGeneration: intent.generation, stepIntentId: intent.id, stepJobId: newJob });
    expect(r.after.turn).toEqual(r.before.turn); expect(r.after.notices).toBe(0); expect(r.cancels).toEqual([]); expect(r.errorCode).toBeNull();
  });
  it.each(['failed', 'succeeded', 'cancelled', 'missing'] as const)('marks claimed %s needs-review without replay', async status => {
    const r = await run({ mode: 'claimed', status }); noEffects(r);
    expect(r.after.intents[0]).toMatchObject({ id: first(r.before.intents).id, phase: 'needs-review', reason: 'STEP_EFFECTS_UNKNOWN', jobId: oldJob });
    expect(r.after.session).toMatchObject({ status: 'idle', stepJobId: null, stepIntentId: null, endedTurns: 1 }); expect(r.after.turn).toMatchObject({ outcome: 'interrupted', steps: 0 }); expect(r.after.notices).toBe(1);
  });
  it.each(['id', 'name', 'workspace', 'session', 'turn', 'intent', 'generation', 'extra', 'legacy-input', 'retries', 'attempts'])('denies claimed authority for wrong %s and never cancels the unverified job', async fault => {
    const r = await run({ mode: 'claimed', status: 'running', fault }); noEffects(r); expect(r.matches).toBe(false); expect(first(r.after.intents).phase).toBe('needs-review'); expect(r.after.turn.steps).toBe(0);
  });
  it('denies queued metadata as evidence of a modern claim', async () => {
    const r = await run({ mode: 'claimed' }); noEffects(r); expect(r.matches).toBe(false); expect(first(r.after.intents).phase).toBe('needs-review');
  });
  it('redispatches mismatched prepared metadata without cancelling foreign work', async () => {
    const r = await run({ fault: 'workspace' }); expect(r.matches).toBe(false); expect(r.enqueues).toHaveLength(1); expect(r.cancels).toEqual([]); expect(first(r.after.intents)).toMatchObject({ phase: 'prepared', jobId: newJob });
  });
  it.each(['missing', 'failed'] as const)('retains legacy %s diagnostic binding without replay', async status => {
    const r = await run({ mode: 'legacy', status }); noEffects(r);
    expect(r.before.intents).toEqual([]); expect(r.after.intents).toEqual([expect.objectContaining({ phase: 'needs-review', jobId: null, legacyJobId: oldJob, reason: 'STEP_EFFECTS_UNKNOWN', generation: 1 })]); expect(r.after.turn.outcome).toBe('interrupted'); expect(r.after.notices).toBe(1);
  });
  it.each(['name', 'workspace', 'session', 'turn', 'extra', 'retries', 'attempts'])('cannot manufacture a legacy claim from wrong %s', async fault => {
    const r = await run({ mode: 'legacy', status: 'running', fault }); noEffects(r); expect(r.matches).toBe(false); expect(first(r.after.intents)).toMatchObject({ phase: 'needs-review', legacyJobId: oldJob }); expect(r.after.turn.steps).toBe(0);
  });
  it('propagates an operational metadata error as the identical error object', async () => {
    const r = await run({ fault: 'operational' }); expect(r.errorSame).toBe(true); expect(r.errorCode).toBe('STORE_UNAVAILABLE'); expect(r.after).toEqual(r.before); expect(r.enqueues).toEqual([]); expect(r.cancels).toEqual([]);
  });
  it.each(['abort', 'pre-abort'])('preserves records on %s with the identical abort reason', async fault => {
    const r = await run({ fault, status: 'missing' }); expect(r.errorSame).toBe(true); expect(r.errorCode).toBe('ABORTED'); expect(r.lookups).toEqual(fault === 'pre-abort' ? [] : [oldJob]); expect(r.after).toEqual(r.before); expect(r.enqueues).toEqual([]); expect(r.cancels).toEqual([]);
  });
  it.each(['replace', 'settle', 'cancel'] as const)('revalidates a claimed snapshot after %s during metadata lookup', async transition => {
    const r = await run({ mode: 'claimed', status: 'missing', transition }); noEffects(r); expect(r.after).toEqual(r.observed); expect(r.after.notices).toBe(0); expect(r.after.intents.some(i => i.phase === 'needs-review')).toBe(false);
  });
  it.each(['replace', 'cancel'] as const)('does not redispatch a prepared snapshot after %s during lookup', async transition => {
    const r = await run({ status: 'missing', transition }); noEffects(r); expect(r.after).toEqual(r.observed); expect(r.after.notices).toBe(0);
  });
  it('defers workspace dispatch but commits retry preparation for that session', async () => {
    const r = await run({ workspace: true, defer: true, status: 'missing' }); noEffects(r); expect(r.lookups).toEqual([oldJob]); expect(r.after.session).toMatchObject({ status: 'running', stepIntentId: first(r.before.intents).id, stepGeneration: 1, stepJobId: null }); expect(first(r.after.intents)).toMatchObject({ phase: 'prepared', jobId: null });
  });
  it('workspace recovery dispatches a non-deferred prepared session', async () => {
    const r = await run({ workspace: true, status: 'missing' }); expect(r.enqueues).toHaveLength(1); expect(r.after.session.stepJobId).toBe(newJob); expect(r.cancels).toEqual([]);
  });
  it('rolls back legacy diagnostic preparation on safe-integer overflow', async () => {
    const r = await run({ mode: 'legacy', status: 'missing', overflow: true }); expect(r.errorCode).toBe('VALIDATION_FAILED'); expect(r.after).toEqual(r.before); expect(r.after.intents).toEqual([]); expect(r.enqueues).toEqual([]); expect(r.cancels).toEqual([]);
  });
  it('a redispatched native private consumer claims once before its effect', async () => {
    const r = await run({ status: 'missing', consume: true }); expect(r.enqueues).toHaveLength(1); expect(r.cancels).toEqual([]);
    const queued = first(r.enqueues); expect(await active().waitForJob(queued.id)).toMatchObject({ status: 'succeeded', output: { won: true } });
    const duplicateId = z.string().parse(await active().exec('kvcoder.recoverycheck.duplicate', queued.input));
    expect(await active().waitForJob(duplicateId)).toMatchObject({ status: 'succeeded', output: { won: false } });
    const state = snapshot.parse(await active().exec('kvcoder.recoverycheck.snapshot', queued.input));
    expect(state.turn.steps).toBe(1); expect(state.intents[0]).toMatchObject({ id: queued.input.intentId, generation: queued.input.generation, phase: 'claimed', jobId: queued.id }); expect(state.session.stepJobId).toBe(queued.id);
  });
});
