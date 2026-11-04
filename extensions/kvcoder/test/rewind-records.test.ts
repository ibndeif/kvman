import { describe, expect, it, vi } from 'vitest';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded } from './support/long-messages.ts';
import { command, requestMessages, runs, says, textOf, unstamped } from './support/model-script.ts';
import { seqOf, stored, storedDocs, turnOf } from './support/rewind.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// The chat's records of a rewind (plan 08 §8.1, ADR 0118, 1 and 4): messages, turns, summaries, the marks, what was
// made after the message (records from before ADR 0118: test/unit/rewind-marks.test.ts).

const artifact = (id: string, content: string) => command('artifact', 'write', { id, title: id, content });
const map = command('execution-map', 'set', { goal: 'Ship it', steps: [{ id: 'one', title: 'One', check: 'It runs.' }] });

describe("the chat's records of a rewind (ADR 0118)", { timeout: 60_000 }, () => {
  it('QA77-H11 artifacts and a map made after the message go; an artifact from before keeps its latest version', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'plan', runs(artifact('plan', 'v1')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'report', runs(artifact('plan', 'v2'), artifact('report', 'r'), map), says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect((await kernel.exec('kvcoder.artifact.list', { sessionId })).map((found) => [found.id, found.version])).toEqual([['plan', 2]]);
    expect(await kernel.exec('kvcoder.map.get', { sessionId })).toBeNull();
    await turnOf(kernel, fake, sessionId, 'map first', runs(map), says('ok'));
    await turnOf(kernel, fake, sessionId, 'then', says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(await kernel.exec('kvcoder.map.get', { sessionId })).not.toBeNull();
  });

  it('QA77-H12 turns and a summary after the message go, and seq, usage, and time stay', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2, 3, 4, 5, 6, 7]) await turnOf(kernel, fake, sessionId, padded(`message ${String(index)}`), says(`answer ${String(index)}`));
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
    await turnOf(kernel, fake, sessionId, 'last', says('SUMMARY'), says('answer 8'));
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.8, scope: 'global' });
    expect((await stored(kernel, sessionId)).some((message) => message.kind === 'summary')).toBe(true);
    const nextSeq = Number(storedDocs(kernel, 'sessions', 'title', 'Test')[0]?.data['nextSeq']);
    const before = await kernel.exec('kvcoder.session.get', { sessionId });
    const turns = (await kernel.exec('kvcoder.turn.list', { sessionId, limit: 100 })).length;
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect((await stored(kernel, sessionId)).some((message) => message.kind === 'summary')).toBe(false);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 100 })).toHaveLength(turns - 1);
    const now = await kernel.exec('kvcoder.session.get', { sessionId });
    expect([now.usage, now.durationMs]).toEqual([before.usage, before.durationMs]);
    await turnOf(kernel, fake, sessionId, 'next', says('ok'));
    expect(await seqOf(kernel, sessionId, 'next')).toBe(nextSeq);
    expect(unstamped(textOf(requestMessages(fake).filter((message) => message.role === 'user')[0]))).not.toContain('SUMMARY');
  });

  it('QA77-E15 a queued message goes too, and the preview counts it', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ text: 'slow' });
    fake.reply(held.reply);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start' });
    await vi.waitFor(() => expect(fake.requests().length).toBe(1), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'queued' });
    const seq = await seqOf(kernel, sessionId, 'start');
    expect(await kernel.exec('kvcoder.rewind.files.list', { sessionId, seq })).toEqual({ files: [], messages: 2, running: true });
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'instead', files: true });
    held.release();
    await kernel.clock.advance(0);
    expect((await stored(kernel, sessionId)).filter((message) => message.kind === 'user').map((message) => message.content['content'])).toEqual(['instead']);
  });

  it('QA77-E17 pieces saved after the message go, and pieces from before stay', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'one', runs(command('fs', 'part', { path: 'long.txt', part: 1, content: 'a' })), says('ok'));
    await turnOf(kernel, fake, sessionId, 'two', runs(command('fs', 'part', { path: 'long.txt', part: 2, content: 'b' })), says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(storedDocs(kernel, 'file-parts', 'sessionId', sessionId).map((part) => part.data['part'])).toEqual([1]);
  });
});
