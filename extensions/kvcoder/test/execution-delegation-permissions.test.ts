import { describe, expect, it } from 'vitest';
import { first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionControl, permissionSnapshot, withPermissionWorld } from './support/permission-world.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const delegate = (background = false) => command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'say:answer', ...(background ? { background: true } : {}) });
const setWorkers = (kernel: Parameters<typeof permissionControl>[0], value: ReturnType<typeof worker>[]) => kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value, scope: 'workspace' });

// Original entry, native SQLite, actual settings and process argv observations; gates hold real awaited boundaries.
describe('delegation execution permissions (ADR0044, E114–E118)', { timeout: 30_000 }, () => {
  it.each(['disable', 'remove', 'worker-off'] as const)('rechecks after a subagent worker was selected: %s', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `delegate-select-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'worker-selection', name);
      fake.reply(runs(delegate()), says('done'), says('extra parent reply'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        if (change === 'disable') await disable(kernel, ['delegate']);
        else await setWorkers(kernel, change === 'remove' ? [] : [worker('helper', { enabled: false })]);
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(first(toolResults(fake, 1))).toMatch(/^error (VALIDATION_FAILED|kvcoder\/WORKER_NOT_FOUND):/);
        expect(state.runs).toEqual([]); expect(fake.requests()).toHaveLength(2);
      } finally { gate.release(); }
    }, workers(worker('helper')));
  });

  it.each([false, true])('rechecks a created child before foreground/background start (%s)', async background => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `delegate-created-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'child-created', name);
      fake.reply(runs(delegate(background)), says('done'), says('extra parent reply'), says('extra background reply'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        await disable(kernel, ['delegate']); gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED:/);
        expect(fake.requests()).toHaveLength(2);
      } finally { gate.release(); }
    }, workers(worker('helper')));
  });

  it.each([false, true])('a recorded foreground/background program cannot enqueue after revocation (%s)', async background => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `run-created-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'run-created', name); fake.reply(runs(delegate(background)), says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        const recorded = first((await permissionSnapshot(kernel, sessionId)).runs);
        expect(recorded).toMatchObject({ status: 'running', jobId: null });
        await disable(kernel, ['delegate']); gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(installed.calls('pi')).toEqual([]); expect(state.session.status).toBe('idle');
        expect(first(state.turns).outcome).toBe('done'); expect(first(state.runs)).toMatchObject({ status: 'failed', jobId: null });
        expect(toolResults(fake, 1)).toEqual(['error VALIDATION_FAILED: There is no connector delegate. Make this call again when delegation is available.']);
        expect(fake.requests()).toHaveLength(2);
      } finally { gate.release(); }
    }, workers(programWorker('helper', 'pi')));
  });

  it.each(['disable', 'remove'] as const)('a positive program approval rechecks after worker preparation: %s', async change => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      fake.reply(runs(delegate()), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const question = first((await permissionSnapshot(kernel, sessionId)).questions);
      const name = `delegate-approved-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'approval-worker', name);
      const answering = kernel.exec('kvcoder.question.answer', { questionId: question.id, answer: { confirmed: true } });
      try {
        await gate.waiting;
        if (change === 'disable') await disable(kernel, ['delegate']); else await setWorkers(kernel, []);
        gate.release(); await answering; await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(installed.calls('pi')).toEqual([]); expect(state.runs).toEqual([]); expect(state.receipts).toEqual([]);
        expect(state.questions).toEqual([]); expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(first(toolResults(fake, 1))).toMatch(/^error (VALIDATION_FAILED|kvcoder\/WORKER_NOT_FOUND):/);
      } finally { gate.release(); await answering; }
    }, workers(programWorker('helper', 'pi', { approval: 'ask' })));
  });

  it.each(['disable', 'remove', 'stop', 'enabled', 'captured'] as const)('a separately queued program checks before spawn: %s', async change => {
    const installed = programs.install('pi');
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `delegate-program-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'program-entry', name);
      fake.reply(runs(delegate()), says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        expect(installed.calls('pi')).toEqual([]);
        const during = await permissionSnapshot(kernel, sessionId), run = first(during.runs);
        expect(first(first(during.turns).pending)).toMatchObject({ kind: 'worker', runId: run.id });
        if (change === 'disable') await disable(kernel, ['delegate']);
        if (change === 'remove') await setWorkers(kernel, []);
        if (change === 'stop') await kernel.exec('kvcoder.job.cancel', { sessionId, id: run.id });
        if (change === 'captured') await setWorkers(kernel, [programWorker('helper', 'pi', { instructions: 'Changed.', model: 'new-model' })]);
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        if (change === 'enabled' || change === 'captured') {
          expect(installed.calls('pi')).toEqual([{ cwd: kernel.homeFolder, args: ['-p', '--', 'say:answer'] }]);
          expect(toolResults(fake, 1)).toEqual(['answer']); expect(first(state.runs).status).toBe('succeeded');
        } else {
          expect(installed.calls('pi')).toEqual([]);
          expect(first(state.runs).status).toBe(change === 'stop' ? 'cancelled' : 'failed');
          expect(first(toolResults(fake, 1))).toMatch(change === 'stop' ? /^helper was stopped$/ : /^error (VALIDATION_FAILED|kvcoder\/WORKER_NOT_FOUND):/);
        }
      } finally { gate.release(); }
    }, workers(programWorker('helper', 'pi')));
  });
});
