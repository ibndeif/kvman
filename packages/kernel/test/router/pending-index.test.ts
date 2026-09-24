import { describe, expect, it } from 'vitest';
import { PendingIndex } from '../../src/index.ts';
import { causeMessage, handlerUnit, kernel, now, openRouterFixture, personCommand, type RouterFixture } from './harness.ts';
import { blob } from './outcomes.ts';

async function seed(fixture: RouterFixture): Promise<void> {
  await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } });
  await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f2', lang: 'ar' } });
  await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'fr' } });
  await personCommand(fixture, { type: 'pdf.import', payload: { blobId: blob } });
  await personCommand(fixture, { type: 'pdf.import', payload: { blobId: blob }, delayMs: 9000 });
  await personCommand(fixture, { type: 'pdf.import', payload: { blobId: blob }, delayMs: 3000 });
  const cause = await causeMessage(fixture, 'agent.run', kernel);
  await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ type: 'agent.nothing', payload: {}, onReply: { type: 'agent.tool.record' } }] });
}

function snapshot(index: PendingIndex) {
  return {
    lanes: Object.fromEntries(index.laneKeys().map((key) => [key, index.laneQueue(key).map((entry) => entry.seq)])),
    keyless: Object.fromEntries(index.handlers().map((handler) => [handler, index.keylessQueue(handler).map((entry) => entry.seq)])),
    timers: index.timerWheel().map((entry) => [entry.seq, (entry.notBefore ?? 0) - now()]),
  };
}

describe('the pending index (plan 03 §3.4, ADR 0051)', () => {
  it('M1.4-E25 committed messages go to lane queues, keyless queues, and the timer wheel', async () => {
    const fixture = openRouterFixture();
    await seed(fixture);
    const view = snapshot(fixture.pending);
    expect(view.lanes).toEqual({ '@acme/pdf|file:f1': [1, 3], '@acme/pdf|file:f2': [2] });
    expect(view.timers).toEqual([[6, 3000], [5, 9000]]);
    expect(view.keyless).toEqual({
      '@acme/pdf|command:pdf.import': [4], '@kvman/agent|command:agent.run': [7], '@kvman/agent|command:agent.tool.record': [9],
    });
    const failed = fixture.connection.prepare("SELECT seq FROM messages WHERE state = 'failed'").all();
    expect(failed).toEqual([{ seq: 8 }]);
  });

  it('M1.4-E26 the index rebuilt from SQLite matches, without running messages', async () => {
    const fixture = openRouterFixture();
    await seed(fixture);
    fixture.connection.prepare("UPDATE messages SET state = 'running' WHERE seq = 2").run();
    const rebuilt = snapshot(PendingIndex.rebuild(fixture.connection, now));
    const fed = snapshot(fixture.pending);
    // Seq 7 is the invocation whose unit sent seq 8 and 9; its handler finished it without a scheduler claiming it
    // (claims remove entries from M1.5 on), so only the rebuilt index knows it is done.
    const { '@kvman/agent|command:agent.run': _finished, ...keyless } = fed.keyless;
    expect(rebuilt).toEqual({ ...fed, lanes: { '@acme/pdf|file:f1': [1, 3] }, keyless });
    expect(PendingIndex.rebuild(fixture.connection, now).laneQueue('@acme/pdf|file:f1')[0]).toMatchObject({ handler: '@acme/pdf', priority: 'interactive' });
  });
});
