import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { command, fsCall, runs, says, toolResults } from './support/model-script.ts';
import { disable, permissionSnapshot, readyReply, registerEffect, withPermissionWorld } from './support/permission-world.ts';

const write = (risky = false) => fsCall('write', { path: 'revoked.txt', content: 'forbidden', risky });
const ask = () => command('ask', 'text', { prompt: 'Continue?' });
const effect = () => command('effect', 'add', { text: 'one' });

describe('current permissions at original-entry dispatch (ADR0044)', { timeout: 30_000 }, () => {
  it.each([false, true])('refuses a disabled file approval, including held-behind-question=%s', async held => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      fake.reply(runs(write(true), ...(held ? [ask()] : [])), says('done'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
      const before = await permissionSnapshot(kernel, sessionId);
      const q = first(before.questions.filter(row => row.kind === 'approval'));
      if (held) await kernel.exec('kvcoder.question.answer', { questionId: q.id, answer: { confirmed: true } });
      await disable(kernel, ['fs']);
      const afterDisable = await permissionSnapshot(kernel, sessionId);
      expect(afterDisable.questions).toHaveLength(1);
      expect(afterDisable.dispatches).toEqual([]);
      const remaining = held ? first(before.questions.filter(row => row.kind === 'text')) : q;
      await kernel.exec('kvcoder.question.answer', { questionId: remaining.id, answer: held ? { text: 'yes' } : { confirmed: true } });
      await kernel.clock.advance(0);
      const ended = await permissionSnapshot(kernel, sessionId);
      expect(ended.session.status).toBe('idle'); expect(first(ended.turns).outcome).toBe('done');
      expect(ended.questions).toEqual([]); expect(ended.dispatches).toEqual([]);
      expect(existsSync(path.join(kernel.homeFolder, 'revoked.txt'))).toBe(false);
      expect(toolResults(fake, 1)[0]).toMatch(/^error VALIDATION_FAILED: There is no connector fs\./);
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it.each(['write', 'help'] as const)('refuses a disabled %s from a request already sent to the provider', async name => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      const held = readyReply(runs(name === 'write' ? write() : command('fs', 'help')));
      fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await disable(kernel, ['fs']); held.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.dispatches).toEqual([]); expect(state.session.status).toBe('idle');
        expect(existsSync(path.join(kernel.homeFolder, 'revoked.txt'))).toBe(false);
        expect(toolResults(fake, 1)).toHaveLength(1);
        expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED: There is no connector fs\./);
        expect(fake.requests()).toHaveLength(2);
      } finally { held.release(); }
    });
  });

  it.each(['disable', 'unregister', 'opt-in', 'replace', 'asks'] as const)('uses current registered grants/target after %s', async change => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel);
      const held = readyReply(runs(effect())); fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        if (change === 'disable') await disable(kernel, ['effect']);
        if (change === 'unregister') await kernel.exec('kvcoder.connector.unregister', { name: 'effect' }, answerOwner);
        if (change === 'opt-in') await registerEffect(kernel, 'old', { optIn: true });
        if (change === 'replace') await registerEffect(kernel, 'new');
        if (change === 'asks') await registerEffect(kernel, 'old', { asks: true });
        held.release(); await kernel.clock.advance(0);
        let state = await permissionSnapshot(kernel, sessionId);
        if (change === 'replace') {
          expect(state.effects).toEqual([{ target: 'new', text: 'one' }]);
          expect(state.dispatches).toEqual([{ name: 'kvcoder.permission-fixture.effect-new' }]);
        } else {
          expect(state.effects).toEqual([]); expect(state.dispatches).toEqual([]);
          if (change === 'asks') {
            expect(state.session.status).toBe('waiting');
            await kernel.exec('kvcoder.question.answer', { questionId: first(state.questions).id, answer: { confirmed: false } });
            await kernel.clock.advance(0); state = await permissionSnapshot(kernel, sessionId);
            expect(toolResults(fake, 1)).toEqual(['denied by the user']);
          } else expect(first(toolResults(fake, 1))).toMatch(/^error VALIDATION_FAILED: There is no connector effect\./);
        }
        expect(state.session.status).toBe('idle'); expect(first(state.turns).outcome).toBe('done');
        expect(fake.requests()).toHaveLength(2);
      } finally { held.release(); }
    });
  });

  it('preserves enabled execution and workspace overrides after a stale global disabling', async () => {
    await withPermissionWorld(async (kernel, fake, sessionId) => {
      await registerEffect(kernel);
      const held = readyReply(runs(effect())); fake.reply(held.reply, says('done'));
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await disable(kernel, ['effect'], 'global'); await disable(kernel, [], 'workspace');
        held.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.effects).toEqual([{ target: 'old', text: 'one' }]); expect(state.session.status).toBe('idle');
        expect(toolResults(fake, 1)).toEqual(['{"target":"old","text":"one"}']);
      } finally { held.release(); }
    });
  });
});
