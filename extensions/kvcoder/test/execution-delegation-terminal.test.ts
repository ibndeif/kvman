import { describe, expect, it, vi } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, runs, says } from './support/model-script.ts';
import { permissionControl, permissionSnapshot, readyReply, withPermissionWorld } from './support/permission-world.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { wait } from './support/wait.ts';
import { workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const delegate = (task: string) => command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'find', goal: task, done: 'It is done.' });

describe('exact delegation terminal authority (ADR0044, E119)', { timeout: 30_000 }, () => {
  it("a failure handler held after reading the old run cannot overwrite the person's stop or end newer claimed work", async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const newer = readyReply(says('new done')); fake.reply(runs(delegate(`wait:${installed.gate}`)), says('Started.'), newer.reply);
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
      await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
      const old = first((await permissionSnapshot(kernel, sessionId)).runs);
      if (old.jobId === null) throw new Error('Missing real program job');
      const name = `lost-read-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'lost-read', name);
      const lost = kernel.exec('kvcoder.permission-fixture.lost', { jobId: old.jobId }, answerOwner);
      try {
        await gate.waiting; await kernel.exec('kvcoder.job.cancel', { sessionId, id: old.id });
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'new request' }); await newer.waiting;
        const current = await permissionSnapshot(kernel, sessionId);
        expect(first(current.runs).status).toBe('cancelled'); expect(current.session.status).toBe('running');
        gate.release(); await lost;
        expect(await permissionSnapshot(kernel, sessionId)).toEqual(current);
        newer.release(); await kernel.clock.advance(0); expect(fake.requests()).toHaveLength(3);
      } finally { gate.release(); newer.release(); installed.release(); await lost; }
    }, { ...workers(programWorker('helper', 'pi')), 'kernel.workers': 3 });
  });
});
