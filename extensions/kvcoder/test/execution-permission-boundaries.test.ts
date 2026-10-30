import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { command, fsCall, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionControl, permissionScope, permissionSnapshot, readyReply, registerEffect, withPermissionWorld } from './support/permission-world.ts';
import { helperIds } from './support/helpers.ts';
import { worker, workers } from './support/workers.ts';

describe('permission checks after actual native awaits (ADR0044)', { timeout: 30_000 }, () => {
  it.each(['disable', 'cancel'] as const)('rechecks after a same-file wait when %s commits, preserving the first begun effect', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const name = `permission-write-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'after-write', name);
      fake.reply(runs(fsCall('write', { path: 'ordered.txt', content: 'first' }), fsCall('write', { path: 'ordered.txt', content: 'second' })), says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await gate.waiting;
        expect(readFileSync(path.join(kernel.homeFolder, 'ordered.txt'), 'utf8')).toBe('first');
        if (change === 'disable') await disable(kernel, ['fs']); else await kernel.exec('kvcoder.turn.cancel', { sessionId });
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.dispatches).toEqual([{ name: 'kvcoder.fs.write' }]);
        expect(readFileSync(path.join(kernel.homeFolder, 'ordered.txt'), 'utf8')).toBe('first');
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe(change === 'cancel' ? 'cancelled' : 'done');
        if (change === 'disable') {
          expect(toolResults(fake, 1)).toHaveLength(2);
          expect(first(toolResults(fake, 1))).toContain('"bytes":5');
          expect(toolResults(fake, 1)[1]).toMatch(/^error VALIDATION_FAILED: There is no connector fs\./);
        }
      } finally { gate.release(); }
    });
  });

  it.each(['unregister', 'cancel'] as const)('rereads current rows/authority after registered approval metadata await: %s', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel, 'old', { asks: true });
      fake.reply(runs(command('effect', 'add', { text: 'one' })), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const q = first((await permissionSnapshot(kernel, sessionId)).questions);
      const name = `permission-metadata-${sessionId}`, gate = openGate(name);
      await permissionControl(kernel, 'metadata', name);
      try {
        await kernel.exec('kvcoder.question.answer', { questionId: q.id, answer: { confirmed: true } }); await gate.waiting;
        if (change === 'unregister') await kernel.exec('kvcoder.connector.unregister', { name: 'effect' }, answerOwner);
        else await kernel.exec('kvcoder.turn.cancel', { sessionId });
        gate.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.effects).toEqual([]); expect(state.dispatches).toEqual([]);
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe(change === 'cancel' ? 'cancelled' : 'done');
        if (change === 'unregister') expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED: There is no connector effect\./);
      } finally { gate.release(); }
    });
  });

  it.each(['scope', 'opt-in', 'ask-disabled'] as const)('rechecks a child in-flight reply against current stored %s, not live edited worker instructions', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId, helperFake) => {
      await registerEffect(kernel, 'old', { optIn: true });
      await kernel.exec('kvcoder.connector.enable', { sessionId, names: ['effect'] }, answerOwner);
      const held = readyReply(runs(change === 'ask-disabled' ? command('ask', 'text', { prompt: '?' }) : command('effect', 'add', { text: 'one' })));
      fake.reply(runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'check', goal: 'Do it', done: 'It is done.' })), says('Started.'), says('parent done'));
      helperFake.reply(held.reply, says('child done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        const [childId] = await helperIds(kernel, sessionId);
        if (childId === undefined) throw new Error('Expected a started helper');
        if (change === 'scope') await permissionScope(kernel, childId, { connectors: [] });
        if (change === 'opt-in') await permissionScope(kernel, sessionId, { optedIn: [] });
        if (change === 'ask-disabled') await disable(kernel, ['ask']);
        held.release(); await kernel.clock.advance(0);
        const child = await permissionSnapshot(kernel, childId);
        expect(child.effects).toEqual([]); expect(child.dispatches).toEqual([]); expect(child.questions).toEqual([]);
        expect(child.session.status).toBe('idle'); expect(first(child.turns).outcome).toBe('done');
        const rejection = first(toolResults(helperFake, 1));
        if (change === 'scope') expect(rejection).toBe("error VALIDATION_FAILED: effect isn't available in this subagent.");
        else expect(rejection).toMatch(/^error VALIDATION_FAILED: (There is no connector (effect|ask)\.|ask isn't available in this subagent\.)/);
        expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('idle'); expect(fake.requests()).toHaveLength(3);
      } finally { held.release(); }
    }, workers(worker('helper', { connectors: ['effect'] })));
  });
});
