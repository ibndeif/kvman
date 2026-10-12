import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recoveryOwner, recoverySnapshot, seedRecovery, withRecoveryWorld, type BrokenRecovery } from './support/recovery-world.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

describe('positive workspace recovery (ADR0041, E76–E84)', () => {
  it('send recovers another prepared session without a new intent or duplicate effects', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const prepared = await seedRecovery(kernel, 'prepared');
      fake.reply(says('one'), says('two'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      const recovered = await recoverySnapshot(kernel, prepared.sessionId);
      expect(recovered.turns[0]?.outcome).toBe('done');
      expect(recovered.intents).toHaveLength(1);
      expect(recovered.intents[0]).toMatchObject({ id: prepared.intentId, generation: 1, phase: 'settled' });
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it('a valid partial answer reconciles other sessions but leaves its real remaining wait', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      fake.reply(runs(command('ask', 'text', { prompt: 'First?' }), command('ask', 'text', { prompt: 'Second?' })), says('recovered'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'ask' });
      await kernel.clock.advance(0);
      const waiting = await recoverySnapshot(kernel, target);
      const questionId = waiting.turns[0]?.pending[0]?.questionId;
      if (questionId == null) throw new Error('Expected pending question');
      const sibling = await seedRecovery(kernel, 'prepared');
      expect(await kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'Ada' } })).toEqual({ jobId: null });
      await kernel.clock.advance(0);
      expect((await recoverySnapshot(kernel, sibling.sessionId)).turns[0]?.outcome).toBe('done');
      const partial = await recoverySnapshot(kernel, target);
      expect(partial.session.status).toBe('waiting');
      expect(partial.turns[0]?.pending).toHaveLength(1);
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it('missing claimed work becomes interrupted with retained needs-review identity, never replayed', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const lost = await seedRecovery(kernel, 'claimed');
      fake.reply(says('fresh request'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      const reviewed = await recoverySnapshot(kernel, lost.sessionId);
      expect(reviewed.intents[0]).toMatchObject({ id: lost.intentId, phase: 'needs-review', jobId: 'modern-gone', legacyJobId: null, reason: 'STEP_EFFECTS_UNKNOWN', generation: 1 });
      expect(reviewed.turns[0]).toMatchObject({ outcome: 'interrupted', pending: [], results: [] });
      expect(reviewed.session).toMatchObject({ status: 'idle', turnId: null, stepJobId: null, stepIntentId: null, stepGeneration: 1 });
      expect(reviewed.messages.filter(message => message.kind === 'notice')).toMatchObject([{ content: { code: 'INTERRUPTED' } }]);
      expect(fake.requests()).toHaveLength(1);
      const stale = await kernel.execAsync('kvcoder.turn.step', lost, recoveryOwner);
      expect((await kernel.waitForJob(stale)).status).toBe('succeeded');
      expect(await recoverySnapshot(kernel, lost.sessionId)).toEqual(reviewed);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it('an explicit send to uncertain work opens a new turn, not a replay of the old one', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const lost = await seedRecovery(kernel, 'claimed', { sessionId: target });
      fake.reply(says('new answer'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'new explicit request' });
      await kernel.clock.advance(0);
      const state = await recoverySnapshot(kernel, target);
      expect(state.turns.map(turn => turn.outcome)).toEqual(['interrupted', 'done']);
      expect(state.turns[1]?.id).not.toBe(lost.turnId);
      expect(state.intents.map(intent => [intent.generation, intent.phase])).toEqual([[1, 'needs-review'], [2, 'settled']]);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it('scans beyond1000 records with physically missing legacy fields and preserves real legacy waits', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const waiting = await seedRecovery(kernel, 'waiting');
      const before = await recoverySnapshot(kernel, waiting.sessionId);
      const lost = await seedRecovery(kernel, 'legacy', { padding: 1001 });
      fake.reply(says('current'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      const after = await recoverySnapshot(kernel, lost.sessionId);
      expect(after.turns[0]?.outcome).toBe('interrupted');
      expect(after.intents).toHaveLength(1);
      expect(after.intents[0]).toMatchObject({ phase: 'needs-review', generation: 1, jobId: null, legacyJobId: 'legacy-gone', reason: 'STEP_EFFECTS_UNKNOWN' });
      expect(await recoverySnapshot(kernel, waiting.sessionId)).toEqual(before);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it('examines and interrupts more than1000 active physically legacy sessions without replay', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      await seedRecovery(kernel, 'legacy', { padding: 1001, paddingActive: true });
      fake.reply(says('target only'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      expect(await kernel.exec('kvcoder.recovery-fixture.counts', {}, recoveryOwner)).toEqual({ running: 0, reviews: 1002, active: 0, interrupted: 1002, notices: 1002 });
      expect(fake.requests()).toHaveLength(1);
    });
  }, 30_000);

  it('retains every owned uncertain intent beyond one page without replay', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const lost = await seedRecovery(kernel, 'claimed', { extraIntents: 1001 });
      fake.reply(says('target only'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      expect(await kernel.exec('kvcoder.recovery-fixture.counts', { sessionId: lost.sessionId }, recoveryOwner)).toEqual({ running: 0, reviews: 1002, active: 0, interrupted: 1, notices: 1 });
      expect(fake.requests()).toHaveLength(1);
    });
  }, 30_000);

  it.each<BrokenRecovery>(['dangling', 'foreign', 'phase', 'job', 'null-job', 'generation'])('unprovable %s binding interrupts conservatively without replay or foreign mutation', async broken => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const lost = await seedRecovery(kernel, 'claimed', { broken });
      const foreign = lost.foreignIntentId === undefined ? undefined : await kernel.exec('kvcoder.recovery-fixture.intent', { intentId: lost.foreignIntentId }, recoveryOwner);
      fake.reply(says('target only'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go' });
      await kernel.clock.advance(0);
      const after = await recoverySnapshot(kernel, lost.sessionId);
      expect(after.turns[0]?.outcome).toBe('interrupted');
      expect(after.session).toMatchObject({ status: 'idle', stepJobId: null, stepIntentId: null, turnId: null });
      expect(after.intents.some(intent => intent.phase === 'needs-review')).toBe(true);
      if (lost.foreignIntentId !== undefined) expect(await kernel.exec('kvcoder.recovery-fixture.intent', { intentId: lost.foreignIntentId }, recoveryOwner)).toEqual(foreign);
      if (broken === 'job') expect(after.intents.some(intent => intent.jobId === 'another-unknown' || intent.legacyJobId === 'another-unknown')).toBe(true);
      if (broken !== 'null-job') expect(after.intents.some(intent => intent.jobId === 'modern-gone' || intent.legacyJobId === 'modern-gone')).toBe(true);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it.each(['different session', 'different workspace'])('cancel never stops a real job belonging to a %s', async scope => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      let workspaceId: string | undefined;
      if (scope === 'different workspace') {
        const folder = path.join(kernel.homeFolder, 'foreign-cancel-workspace');
        mkdirSync(folder);
        workspaceId = (await kernel.exec('kernel.workspace.open', { path: folder })).id;
      }
      let release = (): void => undefined, arrived = (): void => undefined;
      const held = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { arrived = resolve; });
      fake.reply({ chunks: [{ get wait() { arrived(); return held; } }, { text: 'foreign done' }] });
      try {
        const foreignSession = await newSession(kernel, workspaceId);
        await kernel.exec('kvcoder.message.send', { sessionId: foreignSession, text: 'foreign' }, workspaceId === undefined ? {} : { workspaceId });
        await ready;
        const before = await recoverySnapshot(kernel, foreignSession, workspaceId);
        const jobId = before.session.stepJobId;
        if (jobId === null) throw new Error('Expected foreign running job');
        await seedRecovery(kernel, 'legacy', { sessionId: target, jobId });
        await kernel.exec('kvcoder.turn.cancel', { sessionId: target });
        expect((await kernel.exec('kernel.jobs.get', { id: jobId })).status).toBe('running');
        expect(await recoverySnapshot(kernel, foreignSession, workspaceId)).toEqual(before);
        const cancelled = await recoverySnapshot(kernel, target);
        expect(cancelled.turns[0]?.outcome).toBe('cancelled');
        expect(cancelled.intents.some(intent => intent.jobId === jobId || intent.legacyJobId === jobId)).toBe(true);
        expect(fake.requests()).toHaveLength(1);
      } finally { release(); await kernel.clock.advance(0); }
    });
  });

  it('invalid files or answers never trigger recovery or consume a valid question', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const pending = await seedRecovery(kernel, 'prepared');
      const waiting = await seedRecovery(kernel, 'waiting');
      const before = await recoverySnapshot(kernel, pending.sessionId);
      const questionBefore = await recoverySnapshot(kernel, waiting.sessionId);
      const questionId = questionBefore.turns[0]?.pending[0]?.questionId;
      if (questionId == null) throw new Error('Expected valid fixture question');
      await expect(kernel.exec('kvcoder.message.send', { sessionId: target, text: 'go', fileIds: ['absent-file'] })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
      await expect(kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: 'wrong' } })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      expect(await recoverySnapshot(kernel, pending.sessionId)).toEqual(before);
      expect(await recoverySnapshot(kernel, waiting.sessionId)).toEqual(questionBefore);
      expect(fake.requests()).toHaveLength(0);
    });
  });

  it('never scans another workspace, including when it is closed, and recovers there only on its own positive command', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const folder = path.join(kernel.homeFolder, 'other-recovery-workspace');
      mkdirSync(folder);
      const other = await kernel.exec('kernel.workspace.open', { path: folder });
      const pending = await seedRecovery(kernel, 'prepared', {}, other.id);
      const otherTarget = await newSession(kernel, other.id);
      const before = await recoverySnapshot(kernel, pending.sessionId, other.id);
      await kernel.exec('kernel.workspace.close', { workspaceId: other.id });
      fake.reply(says('home'), says('other one'), says('other two'));
      await kernel.exec('kvcoder.message.send', { sessionId: target, text: 'home' });
      await kernel.clock.advance(0);
      expect(fake.requests()).toHaveLength(1);
      await kernel.exec('kernel.workspace.open', { path: folder });
      expect(await recoverySnapshot(kernel, pending.sessionId, other.id)).toEqual(before);
      await kernel.exec('kvcoder.message.send', { sessionId: otherTarget, text: 'there' }, { workspaceId: other.id });
      await kernel.clock.advance(0);
      expect((await recoverySnapshot(kernel, pending.sessionId, other.id)).turns[0]?.outcome).toBe('done');
      expect(fake.requests()).toHaveLength(3);
    });
  });

  it('stop, delete, inject and unauthorized sends never recover unrelated prepared work', async () => {
    await withRecoveryWorld(async (kernel, fake, target) => {
      const pending = await seedRecovery(kernel, 'prepared');
      const before = await recoverySnapshot(kernel, pending.sessionId);
      await expect(kernel.exec('kvcoder.message.send', { sessionId: target, text: 'bad' }, recoveryOwner)).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
      await kernel.exec('kvcoder.turn.cancel', { sessionId: target });
      await kernel.exec('kvcoder.session.delete', { sessionId: target });
      fake.reply(says('injected'));
      await kernel.exec('kvcoder.message.inject', { sessionId: await newSession(kernel), text: 'injected' });
      await kernel.clock.advance(0);
      expect(await recoverySnapshot(kernel, pending.sessionId)).toEqual(before);
      expect(fake.requests()).toHaveLength(1);
    });
  });
});
