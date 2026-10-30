import { describe, expect, it, vi } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, runs, says } from './support/model-script.ts';
import { disable, permissionControl, permissionSnapshot, readyReply, withPermissionWorld } from './support/permission-world.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { wait } from './support/wait.ts';
import { workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const delegate = () => command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'find', goal: 'say:answer', done: 'It is done.' });
type Mode = 'duplicate' | 'check' | 'job-null' | 'job-foreign' | 'new-turn';
const alter = (kernel: Parameters<typeof permissionControl>[0], sessionId: string, mode: Mode) => kernel.exec('kvcoder.permission-fixture.delegation', { sessionId, mode }, answerOwner);
// The step publishes the run's job id after its enqueue returns; the queued job may reach its entry gate first when it
// runs on another worker (ADR 0088, 2), so the perturbations wait for that publication.
const publishedRun = (kernel: Parameters<typeof permissionControl>[0], sessionId: string) => vi.waitFor(async () => {
  const run = first((await permissionSnapshot(kernel, sessionId)).runs);
  if (run.jobId === null) throw new Error('Expected actual queued job publication');
  return { ...run, jobId: run.jobId };
}, wait);

// Schema-valid record perturbations are fixture controls, not new product APIs. Every run is a background run
// (ADR 0108, 1): it waits on no turn, so its job rereads the grants and its own job binding only.
describe('delegation authority after metadata awaits (ADR0044)', { timeout: 30_000 }, () => {
  it.each(['disable', 'check', 'job-null', 'job-foreign'] as const)('queued spawn rereads current grants and its job binding: %s', async change => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const entryName = `program-entry-${sessionId}`, entry = openGate(entryName);
      const metadataName = `program-metadata-${sessionId}`, metadata = openGate(metadataName);
      await permissionControl(kernel, 'program-entry', entryName);
      fake.reply(runs(delegate()), says('done'), says('read it'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await entry.waiting;
        const run = await publishedRun(kernel, sessionId);
        // The lead goes on while its run waits (ADR 0108, 1): its step must end first, or it would take the metadata gate.
        await vi.waitFor(async () => expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('idle'), wait);
        await permissionControl(kernel, 'metadata', metadataName); entry.release(); await metadata.waiting;
        if (change === 'disable') await disable(kernel, ['delegate']); else await alter(kernel, sessionId, change);
        const changed = await permissionSnapshot(kernel, sessionId);
        expect(installed.calls('pi')).toEqual([]);
        metadata.release(); expect((await kernel.waitForJob(run.jobId)).status).toBe('succeeded');
        if (change === 'job-foreign') {
          expect(first((await permissionSnapshot(kernel, sessionId)).runs)).toEqual(first(changed.runs));
          expect(installed.calls('pi')).toEqual([]);
          return;
        }
        await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle');
        if (change === 'job-null') {
          expect(installed.calls('pi')).toEqual([{ cwd: kernel.homeFolder, args: ['-p', '--', 'Kind: find\nGoal: say:answer\nDone when: It is done.'] }]);
          expect(first(state.runs)).toMatchObject({ status: 'succeeded', output: 'answer' });
        } else {
          expect(installed.calls('pi')).toEqual([]);
          expect(first(state.runs).status).toBe('failed');
          expect(first(state.runs).output).toMatch(/^error (VALIDATION_FAILED|kvcoder\/WORKER_NOT_FOUND):/);
        }
      } finally { entry.release(); metadata.release(); }
    }, workers(programWorker('helper', 'pi')));
  });

  it.each(['duplicate', 'new-turn'] as const)('a held positive approval cannot consume stale authority: %s', async change => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const newer = readyReply(says('new done')); fake.reply(runs(delegate()), newer.reply);
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const question = first((await permissionSnapshot(kernel, sessionId)).questions);
      const name = `old-approval-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'approval-worker', name);
      const answering = kernel.exec('kvcoder.question.answer', { questionId: question.id, answer: { confirmed: true } });
      try {
        await gate.waiting; await alter(kernel, sessionId, change);
        if (change === 'new-turn') await newer.waiting;
        const current = await permissionSnapshot(kernel, sessionId);
        gate.release(); expect(await answering).toEqual({ jobId: null });
        expect(await permissionSnapshot(kernel, sessionId)).toEqual(current); expect(installed.calls('pi')).toEqual([]);
        expect(current.runs).toEqual([]); expect(current.receipts).toEqual([]);
        if (change === 'new-turn') { newer.release(); await kernel.clock.advance(0); expect(fake.requests()).toHaveLength(2); }
      } finally { gate.release(); newer.release(); await answering; }
    }, workers(programWorker('helper', 'pi', { approval: 'ask' })));
  });
});
