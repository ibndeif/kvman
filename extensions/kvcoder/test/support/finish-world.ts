import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z, type Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI, type FakeReply } from '@kvman/testkit/fake-openai';
import { messageDocSchema, queuedDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../../src/schemas/records.ts';
import { kvcoderFolder } from './kvcoder-kernel.ts';
import { newSession } from './turns.ts';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const stored = { id: z.string() };
const stateSchema = z.object({ session: sessionDocSchema.extend(stored), turns: z.array(turnDocSchema.extend(stored)), intents: z.array(stepIntentDocSchema.extend(stored)), messages: z.array(messageDocSchema.extend(stored)), queued: z.array(queuedDocSchema.extend(stored)) });
export const finishOwner = { as: '@kvman/kvcoder' };
export type FinishMode = 'none' | 'before' | 'after' | 'rollback' | 'error-gate' | 'enqueue-gate' | 'enqueue-fail' | 'model-gate';
const entry = `
import { z, ProblemError, type Ctx, type Store, type JsonObject, type Filter, type TransactionCollection, type Stored } from '@kvman/sdk';
import original from ${source('index.ts')};
import { txRecords } from ${source('store/collections.ts')};
import { prepareStep, settleStep } from ${source('turns/step-intents.ts')};
const controlsSchema = z.object({ sessionId: z.string(), mode: z.enum(['none', 'before', 'after', 'rollback', 'error-gate', 'enqueue-gate', 'enqueue-fail', 'model-gate']), gate: z.string(), enqueues: z.number().int(), jobId: z.string().nullable() });
const ids = z.object({ sessionId: z.string() });
function all<T extends JsonObject>(collection: TransactionCollection<T>, filter: Filter<T>) {
  const rows: Stored<T>[] = []; let after: string | undefined;
  for (;;) { const page = collection.find(filter, { limit: 1000, ...(after === undefined ? {} : { after }) }); rows.push(...page); if (page.length < 1000) return rows; after = page[page.length - 1]?.id; }
}
export default (ctx: Ctx): void => {
  const gate = (name: string) => new Promise<void>(resolve => {
    const channel = new BroadcastChannel(name), signal = ctx.job.signal;
    const finish = () => { channel.close(); signal.removeEventListener('abort', finish); resolve(); };
    channel.onmessage = finish; signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) { finish(); return; }
    const ready = new BroadcastChannel(name + ':ready'); ready.postMessage('ready'); ready.close();
  });
  const live = (s: ReturnType<typeof txRecords>, sessionId: string) => {
    const session = s.sessions.get(sessionId), turn = session?.turnId === null || session === undefined ? undefined : s.turns.get(session.turnId);
    const intent = session?.stepIntentId === null || session === undefined ? undefined : s.stepIntents.get(session.stepIntentId);
    const [last] = s.messages.find({ sessionId }, { limit: 1, order: 'desc' });
    return session?.status === 'running' && turn?.outcome === null && intent?.phase === 'claimed' && intent.jobId === ctx.job.id && last?.kind === 'assistant' && last.turnId === turn.id ? { session, turn } : undefined;
  };
  const wrapped: Store = {
    get kv() { return ctx.store.kv; }, get global() { return ctx.store.global; }, collection: (name, schema) => ctx.store.collection(name, schema),
    transaction: async fn => {
      const beforeGate = await ctx.store.transaction(tx => {
        const c = tx.collection('finish-controls', controlsSchema), [control] = c.find({}, { limit: 1 });
        if (control?.mode !== 'before' || live(txRecords(tx), control.sessionId) === undefined) return null;
        c.update(control.id, { mode: 'none', jobId: ctx.job.id }); return control.gate;
      });
      if (beforeGate !== null) await gate(beforeGate);
      let errorGate: string | undefined;
      try {
        const committed = await ctx.store.transaction(tx => {
          const s = txRecords(tx), c = tx.collection('finish-controls', controlsSchema), [control] = c.find({}, { limit: 1 });
          const before = control === undefined ? undefined : live(s, control.sessionId);
          if (before !== undefined && control?.mode === 'error-gate') errorGate = control.gate;
          const value = fn(tx), after = before === undefined ? undefined : s.sessions.get(before.session.id);
          const transitioned = before !== undefined && after !== undefined && (after.status === 'idle' || after.stepIntentId !== before.session.stepIntentId);
          if (transitioned && control?.mode === 'rollback') { errorGate = control.gate; throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Fixture finish rollback.', params: {} }); }
          let afterGate: string | null = null;
          if (transitioned && after?.status === 'idle' && control?.mode === 'after') { c.update(control.id, { mode: 'none', jobId: ctx.job.id }); afterGate = control.gate; }
          return { value, afterGate };
        });
        if (committed.afterGate !== null) await gate(committed.afterGate);
        return committed.value;
      } catch (error) { if (errorGate !== undefined) await gate(errorGate); throw error; }
    },
  };
  const enqueue: Ctx['execAsync'] = async (...args) => {
    if (args[0] === 'kvcoder.turn.step') {
      const { sessionId } = ids.parse(args[1]);
      const control = await ctx.store.transaction(tx => {
        const c = tx.collection('finish-controls', controlsSchema), [row] = c.find({ sessionId }, { limit: 1 });
        if (row === undefined) return undefined;
        c.update(row.id, { enqueues: row.enqueues + 1, mode: row.mode === 'enqueue-gate' || row.mode === 'enqueue-fail' ? 'none' : row.mode }); return row;
      });
      if (control?.mode === 'enqueue-gate') await gate(control.gate);
      if (control?.mode === 'enqueue-fail') throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Fixture successor enqueue failed.', params: {} });
    }
    return ctx.execAsync(...args);
  };
  const invoke: Ctx['exec'] = async (...args) => {
    if (args[0] === 'kvai.complete') {
      const { sessionId } = ids.parse(args[1]);
      const name = await ctx.store.transaction(tx => {
        const c = tx.collection('finish-controls', controlsSchema), [row] = c.find({ sessionId }, { limit: 1 });
        if (row?.mode !== 'model-gate') return null;
        c.update(row.id, { mode: 'none', jobId: ctx.job.id }); return row.gate;
      });
      if (name !== null) await gate(name);
    }
    return ctx.exec(...args);
  };
  original(new Proxy(ctx, { get: (target, key) => key === 'store' ? wrapped : key === 'execAsync' ? enqueue : key === 'exec' ? invoke : Reflect.get(target, key, target) }));
  ctx.registerCommand('kvcoder.finish-fixture.control', { description: 'Set isolated finish gates.', input: controlsSchema.pick({ sessionId: true, mode: true, gate: true }), output: z.object({}), handle: input => ctx.store.transaction(tx => {
    const c = tx.collection('finish-controls', controlsSchema), [row] = c.find({ sessionId: input.sessionId }, { limit: 1 });
    if (row === undefined) c.insert({ ...input, enqueues: 0, jobId: null }); else c.update(row.id, input); return {};
  }) });
  ctx.registerQuery('kvcoder.finish-fixture.control-state', { description: 'Read isolated finish controls.', input: ids, output: controlsSchema, handle: ({ sessionId }) => ctx.store.transaction(tx => tx.collection('finish-controls', controlsSchema).find({ sessionId }, { limit: 1 })[0]) });
  ctx.registerQuery('kvcoder.finish-fixture.snapshot', { description: 'Read complete original product records.', input: ids, output: z.json(), handle: ({ sessionId }) => ctx.store.transaction(tx => {
    const s = txRecords(tx); return { session: s.sessions.get(sessionId), turns: all(s.turns, { sessionId }), intents: all(s.stepIntents, { sessionId }), messages: all(s.messages, { sessionId }), queued: all(s.queued, { sessionId }) };
  }) });
  ctx.registerCommand('kvcoder.finish-fixture.seed', { description: 'Seed schema-valid queued boundary records.', input: ids.extend({ count: z.number().int().positive().max(3101), metadata: z.boolean().default(true) }), output: z.object({}), handle: ({ sessionId, count, metadata }) => ctx.store.transaction(tx => {
    const s = txRecords(tx);
    for (let i = 0; i < count; i += 1) s.queued.insert({ sessionId, source: i === count - 1 ? { kind: 'extension', name: '@kvman/kvcoder' } : { kind: 'user' }, text: 'bulk-' + String(i).padStart(4, '0'), fileIds: metadata && i === count - 1 ? ['fixture-file'] : null, fileNames: metadata && i === count - 1 ? ['kept.png'] : null, createdAt: new Date().toISOString() });
    return {};
  }) });
  ctx.registerCommand('kvcoder.finish-fixture.generation', { description: 'Set isolated idle overflow fixture.', input: ids, output: z.object({}), handle: ({ sessionId }) => ctx.store.transaction(tx => { const s = txRecords(tx), session = s.sessions.get(sessionId); if (session?.status !== 'idle') throw new Error('Fixture must be idle'); s.sessions.update(sessionId, { stepGeneration: Number.MAX_SAFE_INTEGER - 1 }); return {}; }) });
  ctx.registerCommand('kvcoder.finish-fixture.replace', { description: 'Fixture-only supersession without aborting the old finisher.', input: ids, output: z.object({}), handle: ({ sessionId }) => ctx.store.transaction(tx => {
    const s = txRecords(tx), session = s.sessions.get(sessionId);
    if (session === undefined || session.turnId === null || session.stepIntentId === null || session.stepJobId === null) throw new Error('Fixture must have a claimed step');
    const identity = { sessionId, turnId: session.turnId, intentId: session.stepIntentId, generation: session.stepGeneration };
    if (!settleStep(s, identity, session.stepJobId)) throw new Error('Fixture settlement failed');
    prepareStep(s, sessionId, session.turnId); return {};
  }) });
  ctx.registerCommand('kvcoder.finish-fixture.inject-ended', { description: 'Actual recognized session-handler injection.', public: true, input: ids.passthrough(), output: z.object({}), handle: async ({ sessionId }) => { await ctx.exec('kvcoder.message.inject', { sessionId, text: 'handler message' }); return {}; } });
};`;

export async function withFinishWorld(check: (kernel: TestKernel, fake: FakeOpenAI, sessionId: string) => Promise<void>, settings: Record<string, Json> = {}): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-finish-'));
  let kernel: TestKernel | undefined, fake: FakeOpenAI | undefined;
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
export const finishSnapshot = async (kernel: TestKernel, sessionId: string) => stateSchema.parse(await kernel.exec('kvcoder.finish-fixture.snapshot', { sessionId }, finishOwner));
export const finishControl = (kernel: TestKernel, sessionId: string, mode: FinishMode, gate = '') => kernel.exec('kvcoder.finish-fixture.control', { sessionId, mode, gate }, finishOwner);
export const finishControls = async (kernel: TestKernel, sessionId: string) => z.object({ enqueues: z.number(), jobId: z.string().nullable() }).parse(await kernel.exec('kvcoder.finish-fixture.control-state', { sessionId }, finishOwner));
export function readyModel(text: string): { reply: FakeReply; waiting: Promise<void>; release(): void } {
  let started = (): void => undefined, release = (): void => undefined;
  const waiting = new Promise<void>(resolve => { started = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  return { reply: { chunks: [{ get wait() { started(); return wait; } }, { text }] }, waiting, release: () => release() };
}
