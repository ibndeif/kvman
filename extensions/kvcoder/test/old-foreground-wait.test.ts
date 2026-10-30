import { describe, expect, it, vi } from 'vitest';
import { answerOwner, first } from './support/answer-world.ts';
import { helperIds } from './support/helpers.ts';
import { command, runs, says, toolResults, withoutHelperId } from './support/model-script.ts';
import { permissionSnapshot, readyReply, withPermissionWorld } from './support/permission-world.ts';
import { wait } from './support/wait.ts';
import { brief } from './support/workers.ts';

// A turn saved before ADR 0108 may still wait on a helper's call: when that helper ends, its answer resolves the call
// and the turn goes on, as before (plan 08 §8.1, ADR 0108, 1).

describe('a foreground wait saved before ADR 0108', { timeout: 30_000 }, () => {
  it("QA71-E2 an old turn waiting on a helper's call gets its answer as that call's result", async () => {
    await withPermissionWorld(async (kernel, fake, sessionId, helperFake) => {
      const held = readyReply(says('helper answer'));
      fake.reply(runs(command('delegate', 'run', brief('general', { kind: 'check' })), command('ask', 'confirm', { prompt: 'Go on?' })), says('done'));
      helperFake.reply(held.reply);
      try {
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await held.waiting;
        await vi.waitFor(async () => expect((await permissionSnapshot(kernel, sessionId)).session.status).toBe('waiting'), wait);
        const [helperId = ''] = await helperIds(kernel, sessionId);
        await kernel.exec('kvcoder.permission-fixture.delegation', { sessionId, mode: 'legacy-subagent' }, answerOwner);
        expect(first(first((await permissionSnapshot(kernel, sessionId)).turns).pending)).toMatchObject({ kind: 'subagent', childSessionId: helperId });
        held.release(); await kernel.clock.advance(0);
        const state = await permissionSnapshot(kernel, sessionId);
        expect(state.session.status).toBe('idle');
        expect(first(state.turns)).toMatchObject({ outcome: 'done', pending: [] });
        expect(toolResults(fake, 1).map(withoutHelperId)).toEqual([`started ${helperId}`, 'helper answer']);
        expect(state.messages.filter((message) => message.source?.kind === 'subagent')).toEqual([]);
        expect(fake.requests()).toHaveLength(2);
      } finally { held.release(); }
    });
  });
});
