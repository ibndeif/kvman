import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, fsCall, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionControl, permissionScope, permissionSnapshot, readyReply, registerEffect, withPermissionWorld } from './support/permission-world.ts';

describe('late preparation and exact binding permissions (ADR0044)', { timeout: 30_000 }, () => {
  it('reserves same-file calls in model order before asymmetric metadata preparation', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = readyReply(runs(fsCall('write', { path: 'order.txt', content: 'first' }), fsCall('write', { path: 'order.txt', content: 'second' })));
      const name = `order-metadata-${sessionId}`, gate = openGate(name);
      fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await permissionControl(kernel, 'metadata', name); held.release(); await gate.waiting;
        // A real snapshot is inspected while the first preparation is held; no clock-pause assumption.
        const during = await permissionSnapshot(kernel, sessionId);
        expect(during.dispatches).toEqual([]);
        gate.release(); await kernel.clock.advance(0);
        expect(readFileSync(path.join(kernel.homeFolder, 'order.txt'), 'utf8')).toBe('second');
        expect(toolResults(fake, 1)).toHaveLength(2);
        expect(first(toolResults(fake, 1))).toContain('"created":true');
        expect(toolResults(fake, 1)[1]).toContain('"created":false');
        expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('idle');
      } finally { held.release(); gate.release(); }
    });
  });

  it('reserves artifact write/get in model order before asymmetric metadata preparation', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = readyReply(runs(command('artifact', 'write', { id: 'plan', title: 'Plan', content: 'first' }), command('artifact', 'get', { id: 'plan' })));
      const name = `artifact-metadata-${sessionId}`, gate = openGate(name);
      fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await permissionControl(kernel, 'metadata', name); held.release(); await gate.waiting;
        expect(await kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([]);
        gate.release(); await kernel.clock.advance(0);
        expect(toolResults(fake, 1).map(text => JSON.parse(text) as unknown)).toEqual([
          { id: 'plan', version: 1, created: true, bytes: 5 },
          { id: 'plan', title: 'Plan', format: 'markdown', version: 1, content: 'first' },
        ]);
        expect(await kernel.exec('kvcoder.artifact.get', { sessionId, id: 'plan' })).toMatchObject({ content: 'first', version: 1 });
        expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('idle');
      } finally { held.release(); gate.release(); }
    });
  });

  it.each(['target', 'asks'] as const)('refuses %s changed between initial evaluation and final dispatch', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel);
      const held = readyReply(runs(command('effect', 'add', { text: 'one' })));
      const name = `late-target-${sessionId}`, gate = openGate(name);
      fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await permissionControl(kernel, 'metadata', name, 2); held.release(); await gate.waiting;
        await registerEffect(kernel, change === 'target' ? 'new' : 'old', change === 'asks' ? { asks: true } : {});
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.effects).toEqual([]); expect(state.dispatches).toEqual([]); expect(state.questions).toEqual([]);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(toolResults(fake, 1)).toEqual(['error VALIDATION_FAILED: The connector command changed before execution. Make this call again.']);
      } finally { held.release(); gate.release(); }
    });
  });

  it('rejects an approved held result whose exact binding changes during metadata preparation', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel, 'old', { asks: true });
      fake.reply(runs(command('effect', 'add', { text: 'one' })), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const q = first((await permissionSnapshot(kernel, sessionId)).questions);
      const name = `late-held-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'metadata', name);
      try {
        await kernel.exec('kvcoder.question.answer', { questionId: q.id, answer: { confirmed: true } }); await gate.waiting;
        await kernel.exec('kvcoder.permission-fixture.invalidate-held', { sessionId }, answerOwner);
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.effects).toEqual([]); expect(state.dispatches).toEqual([]);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(toolResults(fake, 1)).toEqual(['error VALIDATION_FAILED: The originating step or approved call is no longer current.']);
      } finally { gate.release(); }
    });
  });

  it('does not execute or mutate newer claimed work when a still-running old lease resumes', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel);
      const old = readyReply(runs(command('effect', 'add', { text: 'old' }))), newer = readyReply(says('new done'));
      const name = `lease-metadata-${sessionId}`, gate = openGate(name);
      fake.reply(old.reply, newer.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await old.waiting;
        await permissionControl(kernel, 'metadata', name); old.release(); await gate.waiting;
        const before = await permissionSnapshot(kernel, sessionId), oldJobId = before.session.stepJobId;
        if (oldJobId === null) throw new Error('Missing held old canonical job');
        const replacement = z.object({ jobId: z.string() }).parse(await kernel.exec('kvcoder.permission-fixture.replace', { sessionId }, answerOwner));
        await newer.waiting;
        const current = await permissionSnapshot(kernel, sessionId);
        expect(current.session).toMatchObject({ status: 'running', stepGeneration: before.session.stepGeneration + 1, stepJobId: replacement.jobId });
        expect(replacement.jobId).not.toBe(oldJobId); expect(current.dispatches).toEqual([]);
        gate.release(); expect((await kernel.waitForJob(oldJobId)).status).toBe('succeeded');
        expect(await permissionSnapshot(kernel, sessionId)).toEqual(current);
        newer.release(); await kernel.clock.advance(0);
        const ended = await permissionSnapshot(kernel, sessionId);
        expect(ended.session.status).toBe('idle'); expect(ended.effects).toEqual([]); expect(ended.dispatches).toEqual([]);
        expect(fake.requests()).toHaveLength(2);
      } finally { old.release(); newer.release(); gate.release(); }
    });
  });

  it.each(['missing', 'cyclic'] as const)('refuses %s session ancestry without dispatch or a looping grant walk', async kind => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel);
      const held = readyReply(runs(command('effect', 'add', { text: 'one' }))); fake.reply(held.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await permissionScope(kernel, sessionId, { parentId: kind === 'cyclic' ? sessionId : 'missing-parent' });
        held.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.effects).toEqual([]); expect(state.dispatches).toEqual([]); expect(state.questions).toEqual([]);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('maxSteps');
        const result = first(state.messages.filter(message => message.kind === 'toolResult'));
        expect(result.content['isError']).toBe(true);
        expect(JSON.stringify(result.content)).toContain('The session ancestry is no longer available.');
        expect(fake.requests()).toHaveLength(1);
      } finally { held.release(); }
    }, { 'kvcoder.maxSteps': 1 });
  });

  it('does not dispatch revoked binary help after its actual check passed', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = readyReply(runs(command('node', 'help'))); fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        expect(first((await permissionSnapshot(kernel, sessionId)).session.checks ?? [])).toMatchObject({ name: 'node', passed: true });
        await disable(kernel, ['node']); held.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.dispatches).toEqual([]); expect(state.session.status).toBe('idle');
        expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED: There is no connector node\./);
      } finally { held.release(); }
    }, { 'kvcoder.connectors': [{ name: 'node', description: 'Node.', binary: { check: 'node --version' } }] });
  });
});
