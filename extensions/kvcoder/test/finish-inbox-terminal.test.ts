import { describe, expect, it } from 'vitest';
import { first } from './support/answer-world.ts';
import { finishControl, finishControls, finishOwner, finishSnapshot, readyModel, withFinishWorld } from './support/finish-world.ts';
import { openGate } from './support/gates.ts';
import { requestMessages, says, textOf, unstamped } from './support/model-script.ts';

const bulkCount = 2101;
const bulkTexts = Array.from({ length: bulkCount }, (_, index) => 'bulk-' + String(index).padStart(4, '0'));

describe('complete inbox and atomic finish failures (ADR0043)', { timeout: 30_000 }, () => {
  it.each(['maxSteps', 'cancelled'] as const)('%s preserves every queued row beyond two pages without automatic continuation', async outcome => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const model = readyModel('first');
      try {
        fake.reply(model.reply); await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await model.waiting;
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count: bulkCount }, finishOwner);
        expect((await finishSnapshot(kernel, sessionId)).queued).toHaveLength(bulkCount);
        if (outcome === 'cancelled') await kernel.exec('kvcoder.turn.cancel', { sessionId });
        else model.release();
        await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session).toMatchObject({ status: 'idle', turnId: null });
        expect(first(ended.turns).outcome).toBe(outcome);
        expect(ended.queued).toHaveLength(0); expect(ended.queued).toEqual([]);
        expect(ended.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...bulkTexts]);
        expect(ended.messages.find(item => item.content['content'] === bulkTexts.at(-1))).toMatchObject({ fileIds: ['fixture-file'], fileNames: ['kept.png'], source: { kind: 'extension', name: '@kvman/kvcoder' } });
        expect(ended.messages.map(item => item.seq)).toEqual(Array.from({ length: ended.messages.length }, (_, index) => index));
        expect(ended.session.nextSeq).toBe(ended.messages.length);
        if (outcome === 'maxSteps') expect(ended.messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'MAX_STEPS', params: { steps: 1 } } });
        expect(fake.requests()).toHaveLength(1);
        expect(ended.intents).toHaveLength(1);
      } finally { model.release(); }
    }, outcome === 'maxSteps' ? { 'kvcoder.maxSteps': 1 } : {});
  });

  it.each([1000, 2000])('an exact %i-row page multiple drains completely at the configured cap', async count => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const model = readyModel('first');
      try {
        fake.reply(model.reply); await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await model.waiting;
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count }, finishOwner);
        expect((await finishSnapshot(kernel, sessionId)).queued).toHaveLength(count);
        model.release(); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(first(ended.turns).outcome).toBe('maxSteps'); expect(ended.queued).toEqual([]);
        expect(ended.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...bulkTexts.slice(0, count)]);
        expect(ended.messages.find(item => item.content['content'] === bulkTexts[count - 1])).toMatchObject({ source: { kind: 'extension', name: '@kvman/kvcoder' }, fileIds: ['fixture-file'], fileNames: ['kept.png'] });
        expect(ended.session.nextSeq).toBe(ended.messages.length); expect(fake.requests()).toHaveLength(1);
      } finally { model.release(); }
    }, { 'kvcoder.maxSteps': 1 });
  });

  it('an actual nonretryable provider failure preserves the entire inbox and original failure details', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':provider');
      try {
        await finishControl(kernel, sessionId, 'model-gate', sessionId + ':provider');
        fake.reply({ status: 400, body: { error: { message: 'Bad request', type: 'invalid_request_error' } } });
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count: bulkCount }, finishOwner);
        expect((await finishSnapshot(kernel, sessionId)).queued).toHaveLength(bulkCount);
        expect(fake.requests()).toHaveLength(0);
        gate.release(); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(first(ended.turns)).toMatchObject({ outcome: 'failed', steps: 1 }); expect(ended.queued).toEqual([]);
        expect(ended.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...bulkTexts]);
        expect(ended.messages.at(-1)?.content).toEqual({ code: 'STEP_FAILED', params: { code: 'kvai/PROVIDER_ERROR', details: { model: 'fake/m1', reason: expect.stringContaining('Bad request') as unknown, transient: false } } });
        expect(ended.intents).toHaveLength(1); expect(fake.requests()).toHaveLength(1);
      } finally { gate.release(); }
    });
  });

  it('lost-reply exhaustion preserves all inbox pages with the original notice and no fourth request', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const text = 'I will write the file now.', model = readyModel(text);
      try {
        fake.reply({ chunks: [{ text }], usage: { input: 100, output: 3400 } }, { chunks: [{ text }], usage: { input: 100, output: 3500 } }, { ...model.reply, usage: { input: 100, output: 3600 } }, says('never requested'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await model.waiting;
        const running = await finishSnapshot(kernel, sessionId);
        expect(first(running.turns)).toMatchObject({ steps: 3, lost: 2, outcome: null });
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count: bulkCount }, finishOwner);
        expect((await finishSnapshot(kernel, sessionId)).queued).toHaveLength(bulkCount);
        model.release(); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(first(ended.turns)).toMatchObject({ steps: 3, lost: 2, outcome: 'failed' }); expect(ended.queued).toEqual([]);
        expect(ended.messages.filter(item => typeof item.content['content'] === 'string' && item.content['content'].startsWith('bulk-')).map(item => item.content['content'])).toEqual(bulkTexts);
        expect(ended.messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'REPLY_LOST', params: { tokens: 3587 } } });
        expect(ended.intents).toHaveLength(3); expect(fake.requests()).toHaveLength(3);
      } finally { model.release(); }
    });
  });

  it('normal finish drains all pages and commits the successor before any enqueue', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const before = openGate(sessionId + ':bulk-before'), successor = openGate(sessionId + ':bulk-successor'), model = readyModel('second');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':bulk-before'); fake.reply(says('first'), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await before.waiting;
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count: bulkCount, metadata: false }, finishOwner);
        await finishControl(kernel, sessionId, 'enqueue-gate', sessionId + ':bulk-successor'); before.release(); await successor.waiting;
        const committed = await finishSnapshot(kernel, sessionId);
        expect(committed.queued).toHaveLength(0); expect(committed.queued).toEqual([]);
        expect(committed.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...bulkTexts]);
        expect(committed.session).toMatchObject({ status: 'running', stepGeneration: 2, stepJobId: null });
        expect(committed.intents.at(-1)).toMatchObject({ phase: 'prepared', jobId: null });
        expect(first(committed.turns).outcome).toBeNull(); expect(fake.requests()).toHaveLength(1);
        successor.release(); await model.waiting;
        expect(requestMessages(fake, 1).filter(item => item.role === 'user').map(item => unstamped(textOf(item)))).toEqual(['go', ...bulkTexts]);
        model.release(); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(first(ended.turns)).toMatchObject({ outcome: 'done', steps: 2 }); expect(ended.queued).toEqual([]);
        expect(fake.requests()).toHaveLength(2);
      } finally { await kernel.exec('kvcoder.turn.cancel', { sessionId }); before.release(); successor.release(); model.release(); }
    });
  });

  it('a failed finishing job preserves the complete inbox after its failed transaction rolled back', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const before = openGate(sessionId + ':fail-before'), fault = openGate(sessionId + ':fail-after-rollback');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':fail-before'); fake.reply(says('first'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await before.waiting;
        const jobId = (await finishControls(kernel, sessionId)).jobId;
        if (jobId === null) throw new Error('Finishing job missing');
        await kernel.exec('kvcoder.finish-fixture.seed', { sessionId, count: bulkCount }, finishOwner);
        const intact = await finishSnapshot(kernel, sessionId);
        await finishControl(kernel, sessionId, 'rollback', sessionId + ':fail-after-rollback'); before.release(); await fault.waiting;
        expect(await finishSnapshot(kernel, sessionId)).toEqual(intact);
        expect((await finishControls(kernel, sessionId)).enqueues).toBe(1);
        fault.release(); expect(await kernel.waitForJob(jobId)).toMatchObject({ status: 'failed', problem: { code: 'VALIDATION_FAILED', message: 'Fixture finish rollback.' } });
        await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(first(ended.turns).outcome).toBe('interrupted');
        expect(ended.messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'INTERRUPTED', params: { code: 'VALIDATION_FAILED' } } });
        expect(ended.queued).toHaveLength(0); expect(ended.queued).toEqual([]);
        expect(ended.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...bulkTexts]);
        expect(ended.messages.find(item => item.content['content'] === bulkTexts.at(-1))).toMatchObject({ fileIds: ['fixture-file'], fileNames: ['kept.png'] });
        expect(fake.requests()).toHaveLength(1);
      } finally { before.release(); fault.release(); }
    });
  });

  it('an injected throw after no-inbox terminal end rolls the entire transition back before notification', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const before = openGate(sessionId + ':end-before'), fault = openGate(sessionId + ':end-rollback');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':end-before'); fake.reply(says('first'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await before.waiting;
        const intact = await finishSnapshot(kernel, sessionId);
        expect(intact.queued).toEqual([]); expect(intact.session.status).toBe('running'); expect(first(intact.turns).outcome).toBeNull();
        await finishControl(kernel, sessionId, 'rollback', sessionId + ':end-rollback'); before.release(); await fault.waiting;
        expect(await finishSnapshot(kernel, sessionId)).toEqual(intact);
        expect((await finishControls(kernel, sessionId)).enqueues).toBe(1); expect(fake.requests()).toHaveLength(1);
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
      } finally { before.release(); fault.release(); }
    });
  });

  it('successor overflow rolls inbox movement, sequence and canonical state back before enqueue', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const before = openGate(sessionId + ':overflow-before'), fault = openGate(sessionId + ':overflow-rollback');
      try {
        await kernel.exec('kvcoder.finish-fixture.generation', { sessionId }, finishOwner);
        await finishControl(kernel, sessionId, 'before', sessionId + ':overflow-before'); fake.reply(says('first'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await before.waiting;
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'preserved on overflow' });
        const intact = await finishSnapshot(kernel, sessionId);
        expect(intact.session.stepGeneration).toBe(Number.MAX_SAFE_INTEGER);
        await finishControl(kernel, sessionId, 'error-gate', sessionId + ':overflow-rollback'); before.release(); await fault.waiting;
        expect(await finishSnapshot(kernel, sessionId)).toEqual(intact);
        expect((await finishControls(kernel, sessionId)).enqueues).toBe(1);
        expect(fake.requests()).toHaveLength(1);
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
      } finally { before.release(); fault.release(); }
    });
  });

  it('a committed successor survives enqueue failure and only a later explicit send recovers it without replay', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':enqueue-fail');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':enqueue-fail'); fake.reply(says('first'), says('continued'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const jobId = (await finishControls(kernel, sessionId)).jobId;
        if (jobId === null) throw new Error('Original step missing');
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'late' });
        await finishControl(kernel, sessionId, 'enqueue-fail'); gate.release();
        expect(await kernel.waitForJob(jobId)).toMatchObject({ status: 'failed', problem: { code: 'VALIDATION_FAILED', message: 'Fixture successor enqueue failed.' } });
        await kernel.clock.advance(0);
        const prepared = await finishSnapshot(kernel, sessionId), intent = first(prepared.intents.filter(item => item.phase === 'prepared'));
        expect(prepared.session).toMatchObject({ status: 'running', stepGeneration: 2, stepIntentId: intent.id, stepJobId: null });
        expect(intent.jobId).toBeNull(); expect(prepared.queued).toEqual([]);
        expect(prepared.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', 'late']);
        expect(fake.requests()).toHaveLength(1);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'explicit continuation' }); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(ended.queued).toEqual([]); expect(ended.intents.map(item => item.id)).toEqual(prepared.intents.map(item => item.id));
        expect(requestMessages(fake, 1).filter(item => item.role === 'user').map(item => unstamped(textOf(item)))).toEqual(['go', 'late', 'explicit continuation']);
        expect(fake.requests()).toHaveLength(2);
        expect(ended.messages.filter(item => item.kind === 'assistant')).toHaveLength(2);
      } finally { gate.release(); }
    });
  });
});
