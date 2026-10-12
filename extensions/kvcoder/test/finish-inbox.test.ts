import { describe, expect, it } from 'vitest';
import { first } from './support/answer-world.ts';
import { finishControl, finishControls, finishOwner, finishSnapshot, readyModel, withFinishWorld } from './support/finish-world.ts';
import { openGate } from './support/gates.ts';
import { requestMessages, says, textOf, unstamped } from './support/model-script.ts';

const roles = (messages: ReturnType<typeof requestMessages>) => messages.filter(item => item.role !== 'system' && item.role !== 'developer').map(item => item.role + ':' + unstamped(textOf(item)));

describe('atomic original-entry finish/inbox (ADR0043 E100–E106)', { timeout: 30_000 }, () => {
  it('a send before finish moves once after the reply and commits a same-turn successor before enqueue', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const before = openGate(sessionId + ':before'), successor = openGate(sessionId + ':successor'), model = readyModel('second');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':before'); fake.reply(says('first'), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await before.waiting;
        const running = await finishSnapshot(kernel, sessionId), turnId = first(running.turns).id;
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'late' });
        expect((await finishSnapshot(kernel, sessionId)).queued.map(item => item.text)).toEqual(['late']);
        await finishControl(kernel, sessionId, 'enqueue-gate', sessionId + ':successor'); before.release(); await successor.waiting;
        const committed = await finishSnapshot(kernel, sessionId);
        expect(committed.queued).toEqual([]);
        expect(committed.turns).toHaveLength(1);
        expect(first(committed.turns)).toMatchObject({ id: turnId, outcome: null, endedAt: null, steps: 1 });
        expect(committed.session).toMatchObject({ status: 'running', turnId, stepGeneration: 2, stepJobId: null });
        expect(committed.intents.map(item => [item.generation, item.phase])).toEqual([[1, 'settled'], [2, 'prepared']]);
        expect(committed.messages.map(item => item.content['content'])).toEqual(['go', [{ type: 'text', text: 'first' }], 'late']);
        expect(committed.messages.at(-1)).toMatchObject({ turnId, seq: 2, source: { kind: 'user' } });
        expect(fake.requests()).toHaveLength(1);
        successor.release(); await model.waiting;
        expect(roles(requestMessages(fake, 1))).toEqual(['user:go', 'assistant:first', 'user:late']);
        model.release(); await kernel.clock.advance(0);
        const ended = await finishSnapshot(kernel, sessionId);
        expect(ended.session).toMatchObject({ status: 'idle', turnId: null });
        expect(ended.queued).toEqual([]);
        expect(first(ended.turns)).toMatchObject({ id: turnId, outcome: 'done', steps: 2 });
        expect(fake.requests()).toHaveLength(2);
      } finally { before.release(); successor.release(); model.release(); }
    });
  });

  it('a send after terminal commit opens a new turn which old postcommit notification cannot finish or erase', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':after'), model = readyModel('new answer');
      try {
        await finishControl(kernel, sessionId, 'after', sessionId + ':after'); fake.reply(says('first'), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const ended = await finishSnapshot(kernel, sessionId), oldTurn = first(ended.turns), oldJob = (await finishControls(kernel, sessionId)).jobId;
        if (oldJob === null) throw new Error('Finishing job missing');
        expect(ended.session.status).toBe('idle'); expect(oldTurn.outcome).toBe('done');
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'after commit' }); await model.waiting;
        const current = await finishSnapshot(kernel, sessionId);
        expect(current.turns).toHaveLength(2);
        expect(current.session).toMatchObject({ status: 'running', stepGeneration: 2 });
        expect(current.session.turnId).not.toBe(oldTurn.id);
        expect(current.intents.at(-1)).toMatchObject({ turnId: current.session.turnId, phase: 'claimed' });
        expect(roles(requestMessages(fake, 1))).toEqual(['user:go', 'assistant:first', 'user:after commit']);
        gate.release(); expect((await kernel.waitForJob(oldJob)).status).toBe('succeeded');
        expect(await finishSnapshot(kernel, sessionId)).toEqual(current);
        expect(fake.requests()).toHaveLength(2);
        model.release(); await kernel.clock.advance(0);
        const final = await finishSnapshot(kernel, sessionId);
        expect(final.turns.map(item => item.outcome)).toEqual(['done', 'done']); expect(final.queued).toEqual([]);
      } finally { gate.release(); model.release(); }
    });
  });

  it('concurrent public sends before finish are delivered once in their committed inbox order', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':concurrent');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':concurrent'); fake.reply(says('first'), says('second'));
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const texts = ['late-a', 'late-b', 'late-c'];
        await Promise.all(texts.map(text => kernel.exec('kvcoder.message.send', { sessionId, text })));
        const queued = (await finishSnapshot(kernel, sessionId)).queued.map(item => item.text);
        expect([...queued].sort()).toEqual([...texts].sort());
        gate.release(); await kernel.clock.advance(0);
        const final = await finishSnapshot(kernel, sessionId);
        expect(final.messages.filter(item => item.kind === 'user').map(item => item.content['content'])).toEqual(['go', ...queued]);
        expect(roles(requestMessages(fake, 1))).toEqual(['user:go', 'assistant:first', ...queued.map(text => 'user:' + text)]);
        expect(final.session.status).toBe('idle'); expect(final.queued).toEqual([]);
        expect(final.intents.map(item => item.generation)).toEqual([1, 2]);
        expect(fake.requests()).toHaveLength(2);
      } finally { gate.release(); }
    });
  });

  it('cancel before finish prevents the old transaction from draining or ending new work', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':cancel'), model = readyModel('new answer');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':cancel'); fake.reply(says('old answer'), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const oldJob = (await finishControls(kernel, sessionId)).jobId;
        if (oldJob === null) throw new Error('Old job missing');
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
        expect((await kernel.waitForJob(oldJob)).status).toBe('cancelled');
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'new work' }); await model.waiting;
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'new inbox' });
        const current = await finishSnapshot(kernel, sessionId);
        expect(current.queued.map(item => item.text)).toEqual(['new inbox']);
        expect(current.turns.map(item => item.outcome)).toEqual(['cancelled', null]);
        gate.release(); expect(await finishSnapshot(kernel, sessionId)).toEqual(current);
        expect(fake.requests()).toHaveLength(2);
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
      } finally { gate.release(); model.release(); }
    });
  });

  it('a still-running replaced lease cannot drain the newer job inbox or finish its turn', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      const gate = openGate(sessionId + ':replaced'), model = readyModel('replacement answer');
      try {
        await finishControl(kernel, sessionId, 'before', sessionId + ':replaced'); fake.reply(says('old answer'), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const oldJob = (await finishControls(kernel, sessionId)).jobId;
        if (oldJob === null) throw new Error('Old finisher missing');
        await kernel.exec('kvcoder.finish-fixture.replace', { sessionId }, finishOwner);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'new work' }); await model.waiting;
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'newer inbox' });
        const current = await finishSnapshot(kernel, sessionId);
        expect(current.session).toMatchObject({ status: 'running', stepGeneration: 2 });
        expect(current.session.stepJobId).not.toBe(oldJob);
        expect(current.intents.map(item => item.phase)).toEqual(['settled', 'claimed']);
        expect(current.queued.map(item => item.text)).toEqual(['newer inbox']);
        expect(first(current.turns).outcome).toBeNull();
        gate.release(); expect((await kernel.waitForJob(oldJob)).status).toBe('succeeded');
        expect(await finishSnapshot(kernel, sessionId)).toEqual(current);
        expect(fake.requests()).toHaveLength(2);
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
      } finally { gate.release(); model.release(); }
    });
  });

  it('recognized ended-handler injection stays idle and reaches the next explicit turn without a feedback loop', async () => {
    await withFinishWorld(async (kernel, fake, sessionId) => {
      await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.turn.ended', command: 'kvcoder.finish-fixture.inject-ended' }, finishOwner);
      fake.reply(says('first')); await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const idle = await finishSnapshot(kernel, sessionId);
      expect(idle.session.status).toBe('idle'); expect(idle.turns).toHaveLength(1); expect(idle.intents).toHaveLength(1); expect(idle.queued).toEqual([]);
      expect(idle.messages.at(-1)).toMatchObject({ kind: 'user', source: { kind: 'extension', name: '@kvman/kvcoder' }, content: { content: 'handler message' } });
      expect(fake.requests()).toHaveLength(1);
      await kernel.exec('kvcoder.handler.unregister', { point: 'kvcoder.turn.ended' }, finishOwner);
      fake.reply(says('second')); await kernel.exec('kvcoder.message.send', { sessionId, text: 'explicit' }); await kernel.clock.advance(0);
      expect(roles(requestMessages(fake, 1))).toEqual(['user:go', 'assistant:first', 'user:handler message', 'user:explicit']);
      expect((await finishSnapshot(kernel, sessionId)).turns).toHaveLength(2);
      expect(fake.requests()).toHaveLength(2);
    });
  });
});
