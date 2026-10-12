import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z, type Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { answerReceiptDocSchema, messageDocSchema, questionDocSchema, runDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../../src/schemas/records.ts';
import { kvcoderFolder } from './kvcoder-kernel.ts';
import { newSession } from './turns.ts';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const stored = { id: z.string() };
export const answerStateSchema = z.object({
  session: sessionDocSchema.extend(stored), turns: z.array(turnDocSchema.extend(stored)),
  questions: z.array(questionDocSchema.extend(stored)), receipts: z.array(answerReceiptDocSchema.extend(stored)),
  intents: z.array(stepIntentDocSchema.extend(stored)), messages: z.array(messageDocSchema.extend(stored)), runs: z.array(runDocSchema.extend(stored)),
});
export const answerOwner = { as: '@kvman/kvcoder' };
const entry = `
import { z, ProblemError, type Ctx, type Store } from '@kvman/sdk';
import original from ${source('index.ts')};
import { txRecords } from ${source('store/collections.ts')};
import { openTurn } from ${source('turns/start-turn.ts')};
import { noUsage } from ${source('turns/history.ts')};
const controlsSchema = z.object({ mode: z.enum(['none', 'rollback', 'enqueue-fail', 'enqueue-gate', 'metadata-gate']), attempts: z.number().int().nonnegative(), gate: z.string() });
export default (ctx: Ctx): void => {
  const gate = (name: string) => new Promise<void>(resolve => {
    const channel = new BroadcastChannel(name), signal = ctx.job.signal;
    const finish = () => { channel.close(); signal.removeEventListener('abort', finish); resolve(); };
    channel.onmessage = finish; signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) { finish(); return; }
    const ready = new BroadcastChannel(name + ':ready'); ready.postMessage('ready'); ready.close();
  });
  const wrapped: Store = {
    get kv() { return ctx.store.kv; }, get global() { return ctx.store.global; },
    collection: (name, schema) => ctx.store.collection(name, schema),
    transaction: fn => ctx.store.transaction(tx => {
      const s = txRecords(tx), before = s.answerReceipts.count({});
      const result = fn(tx);
      const [control] = tx.collection('answer-controls', controlsSchema).find({}, { limit: 1 });
      if (control?.mode === 'rollback' && s.answerReceipts.count({}) > before) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Fixture rollback after answer transition.', params: {} });
      return result;
    }),
  };
  const enqueue: Ctx['execAsync'] = async (...args) => {
    if (args[0] === 'kvcoder.turn.step') {
      const control = await ctx.store.transaction(tx => {
        const c = tx.collection('answer-controls', controlsSchema), [row] = c.find({}, { limit: 1 });
        if (row === undefined) return undefined;
        c.update(row.id, { attempts: row.attempts + 1, mode: row.mode === 'rollback' ? 'rollback' : 'none' });
        return row;
      });
      if (control?.mode === 'enqueue-fail') throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Fixture enqueue failure.', params: {} });
      if (control?.mode === 'enqueue-gate') await gate(control.gate);
    }
    return ctx.execAsync(...args);
  };
  const execute: Ctx['exec'] = async (...args) => {
    const result = await ctx.exec(...args);
    if (args[0] === 'kernel.jobs.get') {
      const name = await ctx.store.transaction(tx => {
        const c = tx.collection('answer-controls', controlsSchema), [row] = c.find({}, { limit: 1 });
        if (row?.mode !== 'metadata-gate') return null;
        c.update(row.id, { mode: 'none' }); return row.gate;
      });
      if (name !== null) await gate(name);
    }
    return result;
  };
  const guarded = new Proxy(ctx, { get: (target, key) => key === 'store' ? wrapped : key === 'execAsync' ? enqueue : key === 'exec' ? execute : Reflect.get(target, key, target) });
  original(guarded);
  ctx.registerCommand('kvcoder.answer-fixture.control', {
    description: 'Set isolated answer transaction/enqueue controls.', input: controlsSchema.pick({ mode: true, gate: true }), output: z.object({}),
    handle: input => ctx.store.transaction(tx => {
      const c = tx.collection('answer-controls', controlsSchema), [row] = c.find({}, { limit: 1 });
      if (row === undefined) c.insert({ ...input, attempts: 0 }); else c.update(row.id, input);
      return {};
    }),
  });
  ctx.registerQuery('kvcoder.answer-fixture.attempts', {
    description: 'Count isolated enqueue attempts.', input: z.object({}), output: z.number(),
    handle: () => ctx.store.transaction(tx => tx.collection('answer-controls', controlsSchema).find({}, { limit: 1 })[0]?.attempts ?? 0),
  });
  ctx.registerQuery('kvcoder.answer-fixture.snapshot', {
    description: 'Inspect original product answer records in one transaction.', input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx);
      return { session: s.sessions.get(sessionId), turns: s.turns.find({ sessionId }, { limit: 1000 }), questions: s.questions.find({ sessionId }, { limit: 1000 }), receipts: s.answerReceipts.find({ sessionId }, { limit: 1000 }), intents: s.stepIntents.find({ sessionId }, { limit: 1000 }), messages: s.messages.find({ sessionId }, { limit: 1000 }), runs: s.runs.find({ sessionId }, { limit: 1000 }) };
    }),
  });
  ctx.registerCommand('kvcoder.answer-fixture.patch', {
    description: 'Set schema-valid isolated overflow/stale fixtures.', input: z.object({ sessionId: z.string(), mode: z.enum(['overflow', 'stale-turn', 'stale-call', 'stale-kind', 'saved-job']), jobId: z.string().exactOptional() }), output: z.object({}),
    handle: ({ sessionId, mode, jobId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx), session = s.sessions.get(sessionId);
      if (!session || session.turnId === null) throw new Error('Missing active fixture');
      const turn = s.turns.get(session.turnId);
      if (!turn) throw new Error('Missing fixture turn');
      if (mode === 'saved-job') {
        if (jobId === undefined || session.stepIntentId === null) throw new Error('Missing saved-job fixture');
        s.sessions.update(sessionId, { stepJobId: jobId }); s.stepIntents.update(session.stepIntentId, { jobId });
      }
      if (mode === 'overflow') s.sessions.update(sessionId, { stepGeneration: Number.MAX_SAFE_INTEGER });
      if (mode === 'stale-turn') s.sessions.update(sessionId, { turnId: 'another-turn' });
      if (mode === 'stale-call') s.turns.update(turn.id, { pending: turn.pending.map(item => ({ ...item, toolCallId: 'another-call' })) });
      if (mode === 'stale-kind') s.turns.update(turn.id, { pending: turn.pending.map(item => ({ ...item, kind: 'worker', questionId: item.questionId })) });
      return {};
    }),
  });
  ctx.registerCommand('kvcoder.answer-fixture.prepared', {
    description: 'Create unrelated safe prepared work without enqueue.', input: z.object({}), output: z.object({ sessionId: z.string() }),
    handle: () => ctx.store.transaction(tx => {
      const s = txRecords(tx), stamp = new Date().toISOString();
      const session = s.sessions.insert({ title: 'Other', autoTitle: false, status: 'idle', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage: noUsage(), durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp });
      openTurn(s, session); return { sessionId: session.id };
    }),
  });
};`;

export async function withAnswerWorld(check: (kernel: TestKernel, fake: FakeOpenAI, sessionId: string) => Promise<void>, settings: Record<string, Json> = {}): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-answers-'));
  let fake: FakeOpenAI | undefined, kernel: TestKernel | undefined;
  try {
    fake = await startFakeOpenAI();
    const manifest = z.object({ name: z.string(), version: z.string(), peerDependencies: z.record(z.string(), z.string()), kvman: z.object({ namespace: z.string(), dependencies: z.record(z.string(), z.string()) }) }).parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
    writeFileSync(path.join(root, 'index.ts'), entry); cpSync(path.join(kvcoderFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    kernel = await createTestKernel({ extensions: [path.join(kvcoderFolder, '../kvai'), path.join(kvcoderFolder, '../kvwebui'), root], settings: { 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1', ...settings } });
    await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
    await check(kernel, fake, await newSession(kernel));
  } finally { try { await kernel?.close(); } finally { try { await fake?.close(); } finally { rmSync(root, { recursive: true, force: true }); } } }
}

export const answerSnapshot = async (kernel: TestKernel, sessionId: string, workspaceId?: string) => answerStateSchema.parse(await kernel.exec('kvcoder.answer-fixture.snapshot', { sessionId }, { ...answerOwner, ...(workspaceId === undefined ? {} : { workspaceId }) }));
export const answerControl = (kernel: TestKernel, mode: 'none' | 'rollback' | 'enqueue-fail' | 'enqueue-gate' | 'metadata-gate', gate = '') => kernel.exec('kvcoder.answer-fixture.control', { mode, gate }, answerOwner);
export const enqueueAttempts = (kernel: TestKernel) => kernel.exec('kvcoder.answer-fixture.attempts', {}, answerOwner);
export function first<T>(items: readonly T[]): T { const value = items[0]; if (value === undefined) throw new Error('Expected fixture record'); return value; }
