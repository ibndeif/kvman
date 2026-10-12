import { describe, expect, it, vi } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionControl, permissionSnapshot, readyReply, withPermissionWorld } from './support/permission-world.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { wait } from './support/wait.ts';
import { workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const delegate = (task = 'say:answer') => command('delegate', 'run', { worker: 'helper', title: 'Helper', task, background: true });

describe('local background pre-enqueue proof, not durable origin authority (ADR0044)', { timeout: 30_000 }, () => {
  it('revoked approved background creation settles its exact consumed question and records a failed unqueued run', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      fake.reply(runs(delegate()), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const question = first((await permissionSnapshot(kernel, sessionId)).questions);
      const name = `approved-background-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'run-created', name);
      const answering = kernel.exec('kvcoder.question.answer', { questionId: question.id, answer: { confirmed: true } });
      try {
        await gate.waiting;
        const created = await permissionSnapshot(kernel, sessionId);
        expect(created.questions).toEqual([]); expect(first(created.runs)).toMatchObject({ status: 'running', jobId: null, toolCallId: null });
        await disable(kernel, ['delegate']); gate.release(); await answering; await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(first(state.runs)).toMatchObject({ status: 'failed', jobId: null }); expect(state.receipts).toEqual([]);
        expect(state.questions).toEqual([]); expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(installed.calls('pi')).toEqual([]); expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED: There is no connector delegate\./);
      } finally { gate.release(); await answering; }
    }, workers(programWorker('helper', 'pi', { approval: 'ask' })));
  });

  it('does not terminalize a changed captured row after background preparation refuses', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `changed-background-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'run-created', name); fake.reply(runs(delegate()), says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await kernel.exec('kvcoder.permission-fixture.delegation', { sessionId, mode: 'run-change' }, answerOwner);
        const changed = first((await permissionSnapshot(kernel, sessionId)).runs);
        await disable(kernel, ['delegate']); gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(first(state.runs)).toEqual(changed); expect(installed.calls('pi')).toEqual([]);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
      } finally { gate.release(); }
    }, workers(programWorker('helper', 'pi')));
  });

  it('preserves the full newer snapshot when local background preparation resumes after lease invalidation', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const old = readyReply(runs(delegate())), newer = readyReply(says('new done'));
      const name = `background-authority-${sessionId}`, gate = openGate(name); fake.reply(old.reply, newer.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await old.waiting;
        await permissionControl(kernel, 'metadata', name, 4); old.release(); await gate.waiting;
        const before = await permissionSnapshot(kernel, sessionId), oldJob = before.session.stepJobId;
        if (oldJob === null) throw new Error('Missing old real step job');
        expect(first(before.runs)).toMatchObject({ status: 'running', jobId: null });
        await kernel.exec('kvcoder.permission-fixture.delegation', { sessionId, mode: 'new-turn' }, answerOwner); await newer.waiting;
        const current = await permissionSnapshot(kernel, sessionId);
        gate.release(); expect((await kernel.waitForJob(oldJob)).status).toBe('succeeded');
        expect(await permissionSnapshot(kernel, sessionId)).toEqual(current); expect(installed.calls('pi')).toEqual([]);
        newer.release(); await kernel.clock.advance(0);
      } finally { old.release(); newer.release(); gate.release(); }
    }, workers(programWorker('helper', 'pi')));
  });

  it('does not infer unstarted from jobId:null when enqueue rejects after guard success', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await permissionControl(kernel, 'enqueue-fail'); fake.reply(runs(delegate()), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const state = await permissionSnapshot(kernel, sessionId);
      expect(first(state.runs)).toMatchObject({ status: 'running', jobId: null, endedAt: null, output: null });
      expect(state.session.status).toBe('idle'); expect(installed.calls('pi')).toEqual([]);
      expect(toolResults(fake, 1)).toEqual(['error VALIDATION_FAILED: Isolated enqueue rejected.']);
    }, workers(programWorker('helper', 'pi')));
  });

  it('retains a real already-enqueued run when its job-ID reply is lost after guard success', async () => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `unknown-enqueue-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'enqueue-unknown', name);
      fake.reply(runs(delegate(`wait:${installed.gate}`)), says('went on'), says('read result'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
        const during = first((await permissionSnapshot(kernel, sessionId)).runs);
        expect(during).toMatchObject({ status: 'running', jobId: null });
        gate.release(); await vi.waitFor(async () => expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('idle'), wait);
        expect(first((await permissionSnapshot(kernel, sessionId)).runs)).toEqual(during);
        expect(toolResults(fake, 1)).toEqual(['error VALIDATION_FAILED: Isolated enqueue outcome unknown.']);
        installed.release(); await kernel.clock.advance(0);
        expect(first((await permissionSnapshot(kernel, sessionId)).runs).status).toBe('succeeded'); expect(fake.requests()).toHaveLength(3);
      } finally { gate.release(); installed.release(); }
    }, workers(programWorker('helper', 'pi')));
  });
});
