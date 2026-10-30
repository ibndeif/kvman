import { describe, expect, it, vi } from 'vitest';
import { first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { heldReply } from './support/held-reply.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { permissionControl, permissionScope, permissionSnapshot, withPermissionWorld } from './support/permission-world.ts';
import { turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { helperIds } from './support/helpers.ts';
import { worker, workers } from './support/workers.ts';

const delegate = () => command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'check', goal: 'Do it', done: 'It is done.' });

describe('a helper never outlives what started it (KVC-04 and KVC-05)', { timeout: 30_000 }, () => {
  it('M2.4-E121 Stop between creating and starting a helper starts no helper turn', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId, helperFake) => {
      const name = `stop-created-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'child-created', name);
      fake.reply(runs(delegate()), says('extra'));
      helperFake.reply(says('helper answer'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('cancelled');
        expect(fake.requests()).toHaveLength(1);
        expect(helperFake.requests()).toHaveLength(0);
      } finally { gate.release(); }
    }, workers(worker('helper')));
  });

  it('M2.4-E122 deleting a chat stops its background helper before its records go', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId, helperFake) => {
      const held = heldReply({ text: 'late helper answer' });
      fake.reply(runs(delegate()), says('parent done'), says('extra'));
      helperFake.reply(held.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
        await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(1), wait);
        await kernel.exec('kvcoder.session.delete', { sessionId });
        // The held model call never ends by itself, so only the delete's cancel can end the step that waits on it: a
        // cancel aborts the job's signal, and the job ends when its handler settles (plan 02 §2.3).
        await vi.waitFor(async () => {
          for (const status of ['running', 'queued'] as const) {
            const jobs = await kernel.exec('kernel.jobs.list', { status, limit: 50 });
            expect(jobs.filter(job => job.name === 'kvcoder.turn.step')).toEqual([]);
          }
        }, wait);
        const steps = (await kernel.exec('kernel.jobs.list', { limit: 50 })).filter(job => job.name === 'kvcoder.turn.step');
        expect(steps.map(job => job.status)).toContain('cancelled');
        for (const id of new Set(steps.map(job => String((job.input as { sessionId: string }).sessionId)))) {
          await expect(kernel.exec('kvcoder.session.get', { sessionId: id }), id).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
        }
        const before = fake.requests().length;
        held.release(); await kernel.clock.advance(0);
        expect(fake.requests()).toHaveLength(before);
        expect(helperFake.requests()).toHaveLength(1);
      } finally { held.release(); }
    }, workers(worker('helper')));
  });

  it('M2.4-E123 a chat marked deleting starts no step, and deleting it again finishes the delete', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await permissionScope(kernel, sessionId, { deleting: true });
      fake.reply(says('never asked'));
      await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'go' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      await kernel.clock.advance(0);
      expect(fake.requests()).toHaveLength(0);
      await kernel.exec('kvcoder.session.delete', { sessionId });
      await expect(kernel.exec('kvcoder.session.get', { sessionId })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
    });
  });

  // Superseded by ADR 0108, 1: a background helper's interrupted step ends its own turn only, and its lead, idle,
  // gets the ending as a message that starts no turn (plan 08 §8.1).
  it("M2.4-E126 a helper's interrupted step ends its turn, its lead starts no turn, and the other helper keeps waiting", async () => {
    await withPermissionWorld(async (kernel, fake, sessionId, helperFake) => {
      const held = heldReply({ text: 'never arrives' });
      fake.reply(runs(delegate(), delegate()), says('Started.'));
      helperFake.reply(runs(shell('true', { risky: true })), held.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
        const children = await vi.waitFor(async () => {
          const ids = await helperIds(kernel, sessionId);
          expect((await Promise.all(ids.map(id => turnState(kernel, id)))).map(child => child.session.status).sort()).toEqual(['running', 'waiting']);
          expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
          return ids;
        }, wait);
        await kernel.restart(); await kernel.clock.advance(0);
        expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
        expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
        const ends = await Promise.all(children.map(id => turnState(kernel, id)));
        expect(ends.map(child => child.session.status).sort()).toEqual(['idle', 'waiting']);
        expect(ends.find(child => child.session.status === 'idle')?.turn).toMatchObject({ outcome: 'interrupted' });
        const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
        expect(messages.filter(message => message.source?.kind === 'subagent')).toHaveLength(1);
      } finally { held.release(); }
    }, workers(worker('helper')));
  });
});
