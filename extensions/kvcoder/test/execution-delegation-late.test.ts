import { describe, expect, it } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionControl, permissionSnapshot, readyReply, withPermissionWorld } from './support/permission-world.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const delegate = () => command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'say:answer' });
type Mode = 'duplicate' | 'foreign-turn' | 'held' | 'check' | 'job-null' | 'job-foreign' | 'new-turn';
const alter = (kernel: Parameters<typeof permissionControl>[0], sessionId: string, mode: Mode) => kernel.exec('kvcoder.permission-fixture.delegation', { sessionId, mode }, answerOwner);

// Schema-valid record perturbations are fixture controls, not new product APIs.
describe('delegation authority after metadata awaits (ADR0044)', { timeout: 30_000 }, () => {
  it.each(['disable', 'check', 'duplicate', 'foreign-turn', 'held', 'job-null', 'job-foreign'] as const)('queued spawn rereads current grants and exact membership: %s', async change => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const entryName = `program-entry-${sessionId}`, entry = openGate(entryName);
      const metadataName = `program-metadata-${sessionId}`, metadata = openGate(metadataName);
      await permissionControl(kernel, 'program-entry', entryName);
      fake.reply(runs(delegate()), says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await entry.waiting;
        const run = first((await permissionSnapshot(kernel, sessionId)).runs);
        if (run.jobId === null) throw new Error('Expected actual queued job publication');
        await permissionControl(kernel, 'metadata', metadataName); entry.release(); await metadata.waiting;
        if (change === 'disable') await disable(kernel, ['delegate']); else await alter(kernel, sessionId, change);
        const changed = await permissionSnapshot(kernel, sessionId);
        expect(installed.calls('pi')).toEqual([]);
        metadata.release(); expect((await kernel.waitForJob(run.jobId)).status).toBe('succeeded');
        if (change === 'duplicate' || change === 'foreign-turn' || change === 'held' || change === 'job-foreign') {
          expect(await permissionSnapshot(kernel, sessionId)).toEqual(changed);
          expect(installed.calls('pi')).toEqual([]); expect(fake.requests()).toHaveLength(1);
        } else {
          await kernel.clock.advance(0);
          const state = await permissionSnapshot(kernel, sessionId);
          expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
          if (change === 'job-null') {
            expect(installed.calls('pi')).toEqual([{ cwd: kernel.homeFolder, args: ['-p', '--', 'say:answer'] }]);
            expect(toolResults(fake, 1)).toEqual(['answer']); expect(first(state.runs).status).toBe('succeeded');
          } else {
            expect(installed.calls('pi')).toEqual([]); expect(first(state.runs).status).toBe('failed');
            expect(first(toolResults(fake, 1))).toMatch(/^error (VALIDATION_FAILED|kvcoder\/WORKER_NOT_FOUND):/);
          }
        }
      } finally { entry.release(); metadata.release(); }
    }, workers(programWorker('helper', 'pi')));
  });

  it('a still-running obsolete program job cannot spawn or change a newer claimed turn', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const entryName = `old-program-entry-${sessionId}`, entry = openGate(entryName);
      const metadataName = `old-program-metadata-${sessionId}`, metadata = openGate(metadataName);
      const newer = readyReply(says('new done'));
      await permissionControl(kernel, 'program-entry', entryName); fake.reply(runs(delegate()), newer.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await entry.waiting;
        const old = first((await permissionSnapshot(kernel, sessionId)).runs);
        if (old.jobId === null) throw new Error('Expected old actual job');
        await permissionControl(kernel, 'metadata', metadataName); entry.release(); await metadata.waiting;
        await alter(kernel, sessionId, 'new-turn'); await newer.waiting;
        const current = await permissionSnapshot(kernel, sessionId);
        expect(current.session.status).toBe('running'); expect(current.session.stepJobId).not.toBeNull();
        metadata.release(); expect((await kernel.waitForJob(old.jobId)).status).toBe('succeeded');
        expect(await permissionSnapshot(kernel, sessionId)).toEqual(current); expect(installed.calls('pi')).toEqual([]);
        newer.release(); await kernel.clock.advance(0); expect(fake.requests()).toHaveLength(2);
      } finally { entry.release(); metadata.release(); newer.release(); }
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
