import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z, type Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI, type FakeReply } from '@kvman/testkit/fake-openai';
import { answerOwner, answerStateSchema } from './answer-world.ts';
import { kvcoderFolder } from './kvcoder-kernel.ts';
import { newSession } from './turns.ts';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import original from ${source('index.ts')};
import { records, txRecords } from ${source('store/collections.ts')};
import { builtinCommands } from ${source('connectors/builtin-connectors.ts')};
import { prepareStep, settleStep } from ${source('turns/step-intents.ts')};
import { dispatchStep, openTurn } from ${source('turns/start-turn.ts')};
import { endTurnState } from ${source('turns/end-turn-state.ts')};
import { runLost } from ${source('delegate/register-worker-run.ts')};
const controlSchema = z.object({ mode: z.enum(['none', 'after-write', 'metadata', 'worker-selection', 'approval-worker', 'child-created', 'run-created', 'program-entry', 'lost-read', 'enqueue-fail', 'enqueue-unknown']), gate: z.string(), occurrence: z.number().int().positive() });
const dispatchSchema = z.object({ name: z.string() });
const effectSchema = z.object({ target: z.string(), text: z.string() });
export default (ctx: Ctx): void => {
  const gate = (name: string) => new Promise<void>(resolve => {
    const channel = new BroadcastChannel(name), signal = ctx.job.signal;
    const finish = () => { channel.close(); signal.removeEventListener('abort', finish); resolve(); };
    channel.onmessage = finish; signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) { finish(); return; }
    const ready = new BroadcastChannel(name + ':ready'); ready.postMessage('ready'); ready.close();
  });
  const take = (mode: 'after-write' | 'metadata' | 'worker-selection' | 'approval-worker' | 'child-created' | 'run-created' | 'program-entry' | 'lost-read' | 'enqueue-fail' | 'enqueue-unknown') => ctx.store.transaction(tx => {
    const c = tx.collection('permission-controls', controlSchema), [row] = c.find({}, { limit: 1 });
    if (row?.mode !== mode) return null;
    if (row.occurrence > 1) { c.update(row.id, { occurrence: row.occurrence - 1 }); return null; }
    c.update(row.id, { mode: 'none' }); return row.gate;
  });
  let selected = false;
  const settings = new Proxy(ctx.settings, { get: (target, key) => key !== 'get' ? Reflect.get(target, key, target) : async (name: string) => {
    const value = await ctx.settings.get(name);
    if (name === 'kvcoder.delegate.workers') {
      const name = await take(selected ? 'worker-selection' : 'approval-worker'); selected = false;
      if (name !== null) await gate(name);
    }
    return value;
  } });
  const execute: Ctx['exec'] = async (...args) => {
    if (args[0] === builtinCommands.fs.write.registration || args[0] === 'kvcoder.connector.help.get' || args[0].startsWith('kvcoder.permission-fixture.effect-')) {
      await ctx.store.collection('permission-dispatches', dispatchSchema).insert({ name: args[0] });
    }
    const result = await ctx.exec(...args);
    if (args[0] === 'kvcoder.delegate.check') selected = true;
    const mode = args[0] === builtinCommands.fs.write.registration ? 'after-write' : args[0] === 'kernel.registrations.list' ? 'metadata' : null;
    const name = mode === null ? null : await take(mode);
    if (name !== null) await gate(name);
    return result;
  };
  const enqueue: Ctx['execAsync'] = async (...args) => {
    const before = args[0] === 'kvcoder.delegate.worker.run' ? await take('enqueue-fail') : null;
    if (before !== null) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Isolated enqueue rejected.', params: {} });
    const id = await ctx.execAsync(...args);
    const after = args[0] === 'kvcoder.delegate.worker.run' ? await take('enqueue-unknown') : null;
    if (after !== null) { await gate(after); throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Isolated enqueue outcome unknown.', params: {} }); }
    return id;
  };
  const register: Ctx['registerCommand'] = (name, command) => ctx.registerCommand(name, name !== 'kvcoder.delegate.worker.run' ? command : {
    ...command, handle: async (...args) => { const name = await take('program-entry'); if (name !== null) await gate(name); return command.handle(...args); },
  });
  const transaction: Ctx['store']['transaction'] = async (...args) => {
    const result = await ctx.store.transaction(...args);
    const child = typeof result === 'string' ? await records(ctx.store).sessions.get(result) : undefined;
    const recorded = z.object({ id: z.string(), command: z.string(), status: z.literal('running') }).safeParse(result);
    const name = child?.parentId !== null && child !== undefined && child.turnId === null ? await take('child-created') : recorded.success ? await take('run-created') : null;
    if (name !== null) await gate(name);
    return result;
  };
  const collection: Ctx['store']['collection'] = (...args) => {
    const c = ctx.store.collection(...args);
    return args[0] !== 'runs' ? c : new Proxy(c, { get: (target, key) => key !== 'find' ? Reflect.get(target, key, target) : async (...args: Parameters<typeof c.find>) => {
      const result = await c.find(...args), query = z.object({ jobId: z.string() }).safeParse(args[0]);
      const name = query.success ? await take('lost-read') : null;
      if (name !== null) await gate(name); return result;
    } });
  };
  const store = () => new Proxy(ctx.store, { get: (target, key) => key === 'transaction' ? transaction : key === 'collection' ? collection : Reflect.get(target, key, target) });
  const wrapped = new Proxy(ctx, { get: (target, key) => key === 'exec' ? execute : key === 'execAsync' ? enqueue : key === 'settings' ? settings : key === 'registerCommand' ? register : key === 'store' ? store() : Reflect.get(target, key, target) });
  original(wrapped);
  ctx.registerCommand('kvcoder.permission-fixture.lost', {
    description: 'Invoke the actual job-loss handler through isolated read gates.', input: z.object({ jobId: z.string() }), output: z.object({}),
    handle: async ({ jobId }) => { await runLost(wrapped, jobId, 'INTERRUPTED'); return {}; },
  });
  for (const target of ['old', 'new']) ctx.registerCommand('kvcoder.permission-fixture.effect-' + target, {
    description: 'Record an isolated registered-target effect.', input: z.object({ text: z.string() }), output: effectSchema, public: true,
    handle: async ({ text }) => { await ctx.store.collection('permission-effects', effectSchema).insert({ target, text }); return { target, text }; },
  });
  ctx.registerCommand('kvcoder.permission-fixture.control', {
    description: 'Arm a single isolated dispatch/metadata gate.', input: controlSchema, output: z.object({}),
    handle: input => ctx.store.transaction(tx => {
      const c = tx.collection('permission-controls', controlSchema), [row] = c.find({}, { limit: 1 });
      if (row === undefined) c.insert(input); else c.update(row.id, input); return {};
    }),
  });
  ctx.registerQuery('kvcoder.permission-fixture.snapshot', {
    description: 'Read native permission/turn state in one transaction.', input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx);
      return { session: s.sessions.get(sessionId), turns: s.turns.find({ sessionId }, { limit: 1000 }), questions: s.questions.find({ sessionId }, { limit: 1000 }), receipts: s.answerReceipts.find({ sessionId }, { limit: 1000 }), intents: s.stepIntents.find({ sessionId }, { limit: 1000 }), messages: s.messages.find({ sessionId }, { limit: 1000 }), runs: s.runs.find({ sessionId }, { limit: 1000 }), dispatches: tx.collection('permission-dispatches', dispatchSchema).find({}, { limit: 1000 }), effects: tx.collection('permission-effects', effectSchema).find({}, { limit: 1000 }) };
    }),
  });
  ctx.registerCommand('kvcoder.permission-fixture.replace', {
    description: 'Replace a canonical lease without cancelling its still-held isolated job.', input: z.object({ sessionId: z.string() }), output: z.object({ jobId: z.string().nullable() }),
    handle: async ({ sessionId }) => {
      const identity = await ctx.store.transaction(tx => {
        const s = txRecords(tx), session = s.sessions.get(sessionId);
        if (session === undefined || session.turnId === null || session.stepIntentId === null || session.stepJobId === null) throw new Error('Missing claimed fixture');
        const lease = { sessionId, turnId: session.turnId, intentId: session.stepIntentId, generation: session.stepGeneration };
        if (!settleStep(s, lease, session.stepJobId)) throw new Error('Missing live fixture lease');
        return prepareStep(s, sessionId, session.turnId);
      });
      return { jobId: await dispatchStep(ctx, identity, false) };
    },
  });
  ctx.registerCommand('kvcoder.permission-fixture.invalidate-held', {
    description: 'Invalidate a saved held binding in an isolated schema-valid fixture.', input: z.object({ sessionId: z.string() }), output: z.object({}),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx), session = s.sessions.get(sessionId), turn = session?.turnId === null || session === undefined ? undefined : s.turns.get(session.turnId);
      if (turn === undefined) throw new Error('Missing held fixture turn');
      s.turns.update(turn.id, { results: turn.results.map(row => row.run === null ? row : { ...row, toolCallId: 'unbound-held-call' }) }); return {};
    }),
  });
  ctx.registerCommand('kvcoder.permission-fixture.delegation', {
    description: 'Alter existing delegation bindings only in an isolated native fixture.',
    input: z.object({ sessionId: z.string(), mode: z.enum(['duplicate', 'foreign-turn', 'held', 'check', 'job-null', 'job-foreign', 'new-turn', 'run-change']) }), output: z.object({ jobId: z.string().nullable() }),
    handle: async ({ sessionId, mode }) => {
      const identity = await ctx.store.transaction(tx => {
        const s = txRecords(tx), session = s.sessions.get(sessionId), turn = session?.turnId === null || session === undefined ? undefined : s.turns.get(session.turnId);
        if (session === undefined || turn === undefined) throw new Error('Missing delegation fixture');
        if (mode === 'run-change') {
          const [run] = s.runs.find({ sessionId, status: 'running' }, { limit: 1 });
          if (run === undefined) throw new Error('Missing changed run fixture');
          s.runs.update(run.id, { call: 'A schema-valid changed run.' }); return null;
        }
        if (mode === 'new-turn') {
          if (endTurnState(s, sessionId, turn.id, 'cancelled', 'cancel') === undefined) throw new Error('Missing old fixture turn');
          const idle = s.sessions.get(sessionId); if (idle === undefined) throw new Error('Missing fixture session');
          const turnId = openTurn(s, idle), opened = s.sessions.get(sessionId);
          if (opened?.stepIntentId === null || opened === undefined) throw new Error('Missing prepared fixture');
          return { sessionId, turnId, intentId: opened.stepIntentId, generation: opened.stepGeneration };
        }
        const pending = turn.pending[0];
        if (pending === undefined) throw new Error('Missing pending fixture');
        if (mode === 'duplicate') s.turns.update(turn.id, { pending: [...turn.pending, { ...pending, toolCallId: 'duplicate-resource' }] });
        if (mode === 'foreign-turn') s.turns.update(turn.id, { sessionId: 'foreign-owner' });
        if (mode === 'held') s.turns.update(turn.id, { results: [...turn.results, { toolCallId: pending.toolCallId, text: 'already held', isError: false, details: null, run: null }] });
        if (mode === 'check') s.sessions.update(sessionId, { checks: (session.checks ?? []).map(check => ({ ...check, passed: false })) });
        if ((mode === 'job-null' || mode === 'job-foreign') && pending.runId !== null) s.runs.update(pending.runId, { jobId: mode === 'job-null' ? null : 'foreign-job' });
        return null;
      });
      return { jobId: identity === null ? null : await dispatchStep(ctx, identity, false) };
    },
  });
  ctx.registerCommand('kvcoder.permission-fixture.scope', {
    description: 'Patch existing scope fields in a schema-valid isolated record, not a product API.',
    input: z.object({ sessionId: z.string(), connectors: z.array(z.string()).exactOptional(), optedIn: z.array(z.string()).exactOptional(), parentId: z.string().nullable().exactOptional(), deleting: z.boolean().exactOptional() }), output: z.object({}),
    handle: ({ sessionId, ...patch }) => ctx.store.transaction(tx => { txRecords(tx).sessions.update(sessionId, patch); return {}; }),
  });
};`;

export async function withPermissionWorld(check: (kernel: TestKernel, fake: FakeOpenAI, sessionId: string) => Promise<void>, settings: Record<string, Json> = {}): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-permissions-'));
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

const stateSchema = answerStateSchema.extend({ dispatches: z.array(z.object({ name: z.string() })), effects: z.array(z.object({ target: z.string(), text: z.string() })) });
export const permissionSnapshot = async (kernel: TestKernel, sessionId: string) => stateSchema.parse(await kernel.exec('kvcoder.permission-fixture.snapshot', { sessionId }, answerOwner));
export const permissionControl = (kernel: TestKernel, mode: 'none' | 'after-write' | 'metadata' | 'worker-selection' | 'approval-worker' | 'child-created' | 'run-created' | 'program-entry' | 'lost-read' | 'enqueue-fail' | 'enqueue-unknown', gate = '', occurrence = 1) => kernel.exec('kvcoder.permission-fixture.control', { mode, gate, occurrence }, answerOwner);
export const permissionScope = (kernel: TestKernel, sessionId: string, patch: { connectors?: string[]; optedIn?: string[]; parentId?: string | null; deleting?: boolean }) => kernel.exec('kvcoder.permission-fixture.scope', { sessionId, ...patch }, answerOwner);
export const disable = (kernel: TestKernel, names: string[], scope: 'workspace' | 'global' = 'workspace') => kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: names, scope });
export const registerEffect = (kernel: TestKernel, target: 'old' | 'new' = 'old', opts: { asks?: true; optIn?: true } = {}) => kernel.exec('kvcoder.connector.register', { name: 'effect', description: 'Isolated effect.', commands: [{ name: 'add', command: `kvcoder.permission-fixture.effect-${target}`, ...(opts.asks === true ? { asks: true } : {}) }], ...(opts.optIn === true ? { optIn: true } : {}) }, answerOwner);

/** Actual provider readiness, not a clock assumption. Release even on assertion failure. */
export function readyReply(reply: FakeReply) {
  if (!('chunks' in reply)) throw new Error('Expected a scripted streaming reply');
  let started = () => {}, release = () => {};
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { waiting, release, reply: { ...reply, chunks: [{ get wait() { started(); return wait; } }, ...reply.chunks] } };
}
