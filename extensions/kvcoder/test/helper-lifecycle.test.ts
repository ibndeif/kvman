import { describe, expect, it, vi } from 'vitest';
import { first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { heldReply } from './support/held-reply.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { permissionControl, permissionScope, permissionSnapshot, withPermissionWorld } from './support/permission-world.ts';
import { turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { worker, workers } from './support/workers.ts';

const delegate = (background = false) => command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Do it', ...(background ? { background: true } : {}) });

describe('a helper never outlives what started it (KVC-04 and KVC-05)', { timeout: 30_000 }, () => {
  it.each([false, true])('M2.4-E121 Stop between creating and starting a helper starts no helper turn (background %s)', async background => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `stop-created-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'child-created', name);
      fake.reply(runs(delegate(background)), says('helper answer'), says('extra'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('cancelled');
        expect(fake.requests()).toHaveLength(1);
      } finally { gate.release(); }
    }, workers(worker('helper')));
  });

  it('M2.4-E122 deleting a chat stops its background helper before its records go', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = heldReply({ text: 'late helper answer' });
      fake.reply(runs(delegate(true)), held.reply, says('parent done'), says('extra'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
        await vi.waitFor(() => expect(fake.requests().length).toBeGreaterThanOrEqual(2), wait);
        await kernel.exec('kvcoder.session.delete', { sessionId });
        // The helper's model call is still held: its step must already be stopped, not left to finish by itself.
        for (const status of ['running', 'queued'] as const) {
          const jobs = await kernel.exec('kernel.jobs.list', { status, limit: 50 });
          expect(jobs.filter(job => job.name === 'kvcoder.turn.step')).toEqual([]);
        }
        const before = fake.requests().length;
        held.release(); await kernel.clock.advance(0);
        expect(fake.requests()).toHaveLength(before);
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

  it("M2.4-E126 a helper's interrupted step ends its parent's turn, and the other helper is cancelled", async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = heldReply({ text: 'never arrives' });
      fake.reply(runs(delegate(), delegate()), runs(shell('true', { risky: true })), held.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
        await vi.waitFor(async () => {
          expect(fake.requests()).toHaveLength(3);
          const ids = ((await turnState(kernel, sessionId)).turn?.pending ?? []).map(item => String(item.childSessionId));
          expect((await Promise.all(ids.map(id => turnState(kernel, id)))).map(child => child.session.status).sort()).toEqual(['running', 'waiting']);
        }, wait);
        const children = ((await turnState(kernel, sessionId)).turn?.pending ?? []).map(item => String(item.childSessionId));
        await kernel.restart(); await kernel.clock.advance(0);
        expect(await turnState(kernel, sessionId)).toMatchObject({ session: { status: 'idle' }, turn: { outcome: 'interrupted' } });
        const ends = await Promise.all(children.map(id => turnState(kernel, id)));
        expect(ends.map(child => child.turn?.outcome).sort()).toEqual(['cancelled', 'interrupted']);
        expect(ends.map(child => child.session.status)).toEqual(['idle', 'idle']);
      } finally { held.release(); }
    }, workers(worker('helper')));
  });
});
