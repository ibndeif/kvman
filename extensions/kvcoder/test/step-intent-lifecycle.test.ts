import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobSchema, z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeChunk } from '@kvman/testkit/fake-openai';
import { messageDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../src/schemas/records.ts';
import { heldReply } from './support/held-reply.ts';
import { openGate } from './support/gates.ts';
import { gateCode } from './support/todo-extension.ts';
import { answered, command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { kvcoderFolder } from './support/kvcoder-kernel.ts';

const source = (name: string) => new URL(`../src/${name}`, import.meta.url).href;
const stored = { id: z.string() };
const stateSchema = z.object({
  session: sessionDocSchema.extend(stored), turns: z.array(turnDocSchema.extend(stored)),
  intents: z.array(stepIntentDocSchema.extend(stored)), messages: z.array(messageDocSchema.extend(stored)),
});
const identitySchema = z.strictObject({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const owner = { as: '@kvman/kvcoder' };

// Store collections are owner-scoped, not accessible by spelling another namespace. This temporary
// manifest invokes the ORIGINAL default entry; its only addition is a read-only transactional query.
const wrapper = `import { z, type Ctx } from '@kvman/sdk';
import original from ${JSON.stringify(source('index.ts'))};
import { txRecords } from ${JSON.stringify(source('store/collections.ts'))};
export default (ctx: Ctx): void => {
  original(ctx);
  ctx.registerQuery('kvcoder.lifecycle-snapshot', {
    description: 'Read-only fixture snapshot.', public: true,
    input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx);
      const session = s.sessions.get(sessionId);
      if (session === undefined) throw new Error('Missing fixture session');
      return { session, turns: s.turns.find({ sessionId }, { limit: 1000 }),
        intents: s.stepIntents.find({ sessionId }, { limit: 1000 }),
        messages: s.messages.find({ sessionId }, { limit: 1000 }) };
    }),
  });
};`;
const probe = `import { z, type Ctx } from '@kvman/sdk';
export default (ctx: Ctx): void => {
${gateCode}
  ctx.registerQuery('step-probe.snapshot', { description: 'Read original owner state.', public: true,
    input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: input => ctx.exec('kvcoder.lifecycle-snapshot', input) });
  ctx.registerCommand('step-probe.block', { description: 'Hold a worker slot.', public: true,
    input: z.object({ gate: z.string() }), output: z.object({}),
    handle: async ({ gate: name }) => { await gate(name); return {}; } });
  ctx.registerCommand('step-probe.inject-held', { description: 'Inject normally, then hold its root slot.', public: true,
    input: z.object({ sessionId: z.string(), gate: z.string() }), output: z.object({}),
    handle: async ({ sessionId, gate: name }) => {
      await ctx.exec('kvcoder.message.inject', { sessionId, text: 'go' });
      ctx.job.progress({ type: 'snapshot', state: await ctx.exec('kvcoder.lifecycle-snapshot', { sessionId }) });
      await gate(name); return {};
    } });
  ctx.registerCommand('step-probe.hit', { description: 'Count a real tool effect.', public: true,
    input: z.object({ text: z.string() }), output: z.object({}),
    handle: async input => { await ctx.store.collection('hits', z.object({ text: z.string() })).insert(input); return {}; } });
  ctx.registerQuery('step-probe.hits', { description: 'Read tool effects.', public: true,
    input: z.object({}), output: z.array(z.object({ text: z.string() })),
    handle: async () => (await ctx.store.collection('hits', z.object({ text: z.string() })).find({}, { limit: 1000 })).map(({ text }) => ({ text })) });
  ctx.registerHandler('kernel.started', { description: 'Register counted connector.', handle: async () => {
    await ctx.exec('kvcoder.connector.register', { name: 'step-probe', description: 'Count effects.',
      commands: [{ name: 'hit', command: 'step-probe.hit' }] });
  } });
};`;

async function withWorld(run: (kernel: TestKernel, fake: Awaited<ReturnType<typeof startFakeOpenAI>>, sessionId: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-intent-lifecycle-'));
  const fake = await startFakeOpenAI();
  let kernel: TestKernel | undefined;
  try {
    const manifest = z.object({ name: z.string(), version: z.string(), peerDependencies: z.record(z.string(), z.string()),
      kvman: z.object({ namespace: z.string(), dependencies: z.record(z.string(), z.string()) }) })
      .parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
    writeFileSync(path.join(root, 'index.ts'), wrapper);
    cpSync(path.join(kvcoderFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    const extra = path.join(root, 'probe');
    mkdirSync(extra);
    writeFileSync(path.join(extra, 'package.json'), JSON.stringify({ name: '@test/step-probe', version: '0.1.0', type: 'module', main: 'index.js',
      peerDependencies: manifest.peerDependencies, kvman: { namespace: 'step-probe', source: 'index.ts', dependencies: { '@kvman/kvcoder': '^0.1.0' } } }));
    writeFileSync(path.join(extra, 'index.ts'), probe);
    kernel = await createTestKernel({ extensions: [path.join(kvcoderFolder, '../kvai'), path.join(kvcoderFolder, '../kvwebui'), root, extra],
      settings: { 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1', 'kvcoder.approval': 'auto' } });
    await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
    await run(kernel, fake, await newSession(kernel));
  } finally {
    try { await kernel?.close(); } finally { await fake.close(); rmSync(root, { recursive: true, force: true }); }
  }
}
async function snapshot(kernel: TestKernel, sessionId: string) {
  return stateSchema.parse(await kernel.exec('step-probe.snapshot', { sessionId }));
}
function current(state: z.output<typeof stateSchema>) {
  const intent = state.intents.find(item => item.id === state.session.stepIntentId);
  if (intent === undefined) throw new Error('Current intent missing');
  return { sessionId: intent.sessionId, turnId: intent.turnId, intentId: intent.id, generation: intent.generation };
}
async function actualJob(kernel: TestKernel, state: z.output<typeof stateSchema>) {
  const id = state.session.stepJobId;
  if (id === null) throw new Error('Canonical job missing');
  const job = jobSchema.parse(await kernel.exec('kernel.jobs.get', { id }));
  expect(job.name).toBe('kvcoder.turn.step');
  expect(identitySchema.parse(job.input)).toEqual(current(state));
  return job;
}
// The getter is read by the local fake server only when this stream reaches its wait chunk.
// No polling, clock delays or operational source hooks are needed to observe model arrival.
function modelGate(...chunks: readonly FakeChunk[]) {
  const held = heldReply(...chunks);
  if (!('chunks' in held.reply)) throw new Error('Expected streaming reply');
  const first = held.reply.chunks[0];
  if (first === undefined || !('wait' in first)) throw new Error('Expected held chunk');
  let arrived = (): void => undefined;
  const waiting = new Promise<void>(resolve => { arrived = resolve; });
  return { waiting, release: held.release, reply: { chunks: [{ get wait() { arrived(); return first.wait; } }, ...chunks] } };
}
async function noEffectJobs(kernel: TestKernel, state: z.output<typeof stateSchema>, inputs: readonly z.output<typeof identitySchema>[]) {
  const ids = await Promise.all(inputs.map(input => kernel.execAsync('kvcoder.turn.step', input, owner)));
  for (const id of ids) expect((await kernel.waitForJob(id)).status).toBe('succeeded');
  expect(await snapshot(kernel, state.session.id)).toEqual(state);
}

describe('original step intent lifecycle (ADR0041, spec08 E75–E88)', { timeout: 30_000 }, () => {
  it('prepared and claimed duplicate jobs make one model request and one tool effect', async () => {
    await withWorld(async (kernel, fake, sessionId) => {
      const blockName = `intent-block-${sessionId}`, sendName = `intent-send-${sessionId}`;
      const block = openGate(blockName), send = openGate(sendName);
      const model = modelGate({ toolCall: { id: 'once', name: 'run', arguments: { description: 'Count once.', connector: 'step-probe', command: 'hit', payload: { text: 'once' } } } });
      fake.reply(model.reply, says('done'));
      try {
        const blocker = await kernel.execAsync('step-probe.block', { gate: blockName });
        await block.waiting;
        // Progress arrives before the root gate; both pool slots remain held until explicitly released.
        let resolveState = (_state: z.output<typeof stateSchema>): void => undefined;
        const ready = new Promise<z.output<typeof stateSchema>>(resolve => { resolveState = resolve; });
        const rootJob = await kernel.execAsync('step-probe.inject-held', { sessionId, gate: sendName }, { onProgress: chunk => {
          const parsed = z.object({ type: z.literal('snapshot'), state: stateSchema }).safeParse(chunk.data);
          if (parsed.success) resolveState(parsed.data.state);
        } });
        const state = await ready;
        await send.waiting;
        expect(state.intents).toHaveLength(1);
        expect(state.intents[0]).toMatchObject({ phase: 'prepared', generation: 1 });
        const input = current(state);
        const duplicates = await Promise.all([kernel.execAsync('kvcoder.turn.step', input, owner), kernel.execAsync('kvcoder.turn.step', input, owner)]);
        send.release(); block.release();
        await Promise.all([kernel.waitForJob(rootJob), kernel.waitForJob(blocker), model.waiting]);
        for (const id of duplicates) expect((await kernel.waitForJob(id)).status).toBe('succeeded');
        const claimed = await snapshot(kernel, sessionId);
        expect(claimed.intents[0]).toMatchObject({ phase: 'claimed', jobId: claimed.session.stepJobId });
        expect(claimed.turns[0]?.steps).toBe(1);
        await actualJob(kernel, claimed);
        await noEffectJobs(kernel, claimed, [input, input]);
        expect(fake.requests()).toHaveLength(1);
        expect(await kernel.exec('step-probe.hits', {})).toEqual([]);
        model.release();
        await kernel.clock.advance(0);
        expect(fake.requests()).toHaveLength(2);
        expect(await kernel.exec('step-probe.hits', {})).toEqual([{ text: 'once' }]);
        const ended = await snapshot(kernel, sessionId);
        expect(ended.intents.map(item => item.phase)).toEqual(['settled', 'settled']);
        expect(ended.turns[0]).toMatchObject({ steps: 2, outcome: 'done' });
        expect(ended.messages.filter(message => message.kind === 'toolResult')).toHaveLength(1);
      } finally { send.release(); block.release(); model.release(); }
    });
  });

  it('successors and new turns advance lifetime generation; old identity and wrong canonical job cannot mutate a held successor', async () => {
    await withWorld(async (kernel, fake, sessionId) => {
      const successor = modelGate({ text: 'successor done' }), nextTurn = modelGate({ text: 'new turn done' });
      fake.reply(runs(command('step-probe', 'hit', { text: 'first' })), successor.reply, nextTurn.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
        await successor.waiting;
        const state = await snapshot(kernel, sessionId);
        expect(state.intents.map(item => [item.generation, item.phase])).toEqual([[1, 'settled'], [2, 'claimed']]);
        await actualJob(kernel, state);
        const old = state.intents[0];
        if (old === undefined) throw new Error('Predecessor missing');
        const input = current(state), stale = { sessionId, turnId: old.turnId, intentId: old.id, generation: old.generation };
        await noEffectJobs(kernel, state, [stale, input, { ...input, generation: 1 }, { ...input, intentId: old.id }]);
        expect(fake.requests()).toHaveLength(2);
        successor.release(); await kernel.clock.advance(0);
        const ended = await snapshot(kernel, sessionId);
        expect(ended.session).toMatchObject({ status: 'idle', stepGeneration: 2, stepIntentId: null, stepJobId: null, turnId: null });
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
        await nextTurn.waiting;
        const newer = await snapshot(kernel, sessionId);
        expect(newer.session.stepGeneration).toBe(3);
        expect(current(newer).turnId).not.toBe(input.turnId);
        await actualJob(kernel, newer);
        await noEffectJobs(kernel, newer, [input, stale]);
        expect(fake.requests()).toHaveLength(3);
        nextTurn.release(); await kernel.clock.advance(0);
        expect((await snapshot(kernel, sessionId)).turns.map(turn => turn.outcome)).toEqual(['done', 'done']);
      } finally { successor.release(); nextTurn.release(); }
    });
  });

  it('cancellation invalidates the old intent; stale jobs and a released old model cannot end or append to new work', async () => {
    await withWorld(async (kernel, fake, sessionId) => {
      const oldModel = modelGate({ text: 'obsolete answer' }), newModel = modelGate({ text: 'current answer' });
      fake.reply(oldModel.reply, newModel.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'old' });
        await oldModel.waiting;
        const old = await snapshot(kernel, sessionId), input = current(old);
        const job = await actualJob(kernel, old);
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
        await kernel.waitForJob(job.id);
        const cancelled = await snapshot(kernel, sessionId);
        expect(cancelled.session).toMatchObject({ status: 'idle', stepGeneration: 1, stepIntentId: null, stepJobId: null, turnId: null });
        expect(cancelled.intents[0]).toMatchObject({ phase: 'invalidated', reason: 'CANCEL_REQUESTED' });
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'new' });
        await newModel.waiting;
        oldModel.release();
        const running = await snapshot(kernel, sessionId);
        expect(running.session.stepGeneration).toBe(2);
        await actualJob(kernel, running);
        await noEffectJobs(kernel, running, [input, { ...input, turnId: current(running).turnId }]);
        expect(fake.requests()).toHaveLength(2);
        expect(running.messages.filter(message => message.kind === 'assistant')).toEqual([]);
        newModel.release(); await kernel.clock.advance(0);
        const ended = await snapshot(kernel, sessionId);
        expect(ended.turns.map(turn => turn.outcome)).toEqual(['cancelled', 'done']);
        expect(ended.messages.filter(message => message.kind === 'assistant')).toHaveLength(1);
      } finally { oldModel.release(); newModel.release(); }
    });
  });

  it('waiting settles and clears pointers; only the last answer prepares a fresh intent in the same turn', async () => {
    await withWorld(async (kernel, fake, sessionId) => {
      const resumed = modelGate({ text: 'answered' });
      fake.reply(runs(command('ask', 'text', { prompt: 'First?' }), command('ask', 'text', { prompt: 'Second?' })), resumed.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'ask me' });
        await kernel.clock.advance(0);
        const waiting = await snapshot(kernel, sessionId);
        expect(waiting.session).toMatchObject({ status: 'waiting', stepGeneration: 1, stepIntentId: null, stepJobId: null });
        expect(waiting.intents[0]?.phase).toBe('settled');
        const turn = waiting.turns[0], old = waiting.intents[0];
        if (turn === undefined || old === undefined) throw new Error('Waiting records missing');
        const [first, second] = turn.pending;
        if (first?.questionId == null || second?.questionId == null) throw new Error('Questions missing');
        expect(await kernel.exec('kvcoder.question.answer', { questionId: first.questionId, answer: { text: 'Ada' } })).toEqual({ jobId: null });
        const partial = await snapshot(kernel, sessionId);
        expect(partial.session).toMatchObject({ status: 'waiting', stepGeneration: 1, stepIntentId: null, stepJobId: null });
        expect(partial.intents).toEqual(waiting.intents);
        const answer = await kernel.exec('kvcoder.question.answer', { questionId: second.questionId, answer: { text: 'Lovelace' } });
        expect(typeof answer.jobId).toBe('string');
        await resumed.waiting;
        const running = await snapshot(kernel, sessionId);
        expect(running.session).toMatchObject({ status: 'running', turnId: turn.id, stepGeneration: 2, stepJobId: answer.jobId });
        expect(current(running).intentId).not.toBe(old.id);
        await actualJob(kernel, running);
        await noEffectJobs(kernel, running, [{ sessionId, turnId: turn.id, intentId: old.id, generation: old.generation }]);
        expect(toolResults(fake)).toEqual([answered('{"text":"Ada"}'), answered('{"text":"Lovelace"}')]);
        resumed.release(); await kernel.clock.advance(0);
        const ended = await snapshot(kernel, sessionId);
        expect(ended.session).toMatchObject({ status: 'idle', stepGeneration: 2, stepIntentId: null, stepJobId: null, turnId: null });
        expect(ended.intents.map(item => item.phase)).toEqual(['settled', 'settled']);
      } finally { resumed.release(); }
    });
  });
});
