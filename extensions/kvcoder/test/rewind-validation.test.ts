import { describe, expect, it } from 'vitest';
import { delegated, helperIds } from './support/helpers.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { seqOf, stored, turnOf } from './support/rewind.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

// What a rewind refuses (plan 08 §8.6, ADR 0118, 6): a helper's chat, a caller who isn't the person, a message that
// can't be edited or undone, and an edit that adds files; each refusal rewinds nothing.

const invalid = { problem: { code: 'VALIDATION_FAILED' } };

describe('what a rewind refuses (ADR 0118)', { timeout: 60_000 }, () => {
  it("QA77-E1 and QA77-E3 a helper's chat, and messages that can't be edited, are refused", async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake } = world;
    const sessionId = await newSession(kernel);
    const run = command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'find', goal: 'Look', done: 'Seen.' });
    await delegated(world, sessionId, [runs(run), says('Started.'), says('Read it.')], [says('found')]);
    const [helper = ''] = await helperIds(kernel, sessionId);
    await expect(kernel.exec('kvcoder.rewind.files.list', { sessionId: helper, seq: 0 })).rejects.toMatchObject(invalid);
    await expect(kernel.exec('kvcoder.message.edit', { sessionId: helper, seq: 0, text: 'x', files: true })).rejects.toMatchObject(invalid);
    await expect(kernel.exec('kvcoder.message.undo', { sessionId: helper, files: true })).rejects.toMatchObject(invalid);
    fake.reply(says('ok'), says('ok'));
    await kernel.exec('kvcoder.message.inject', { sessionId, text: 'From a slash command.' }, { as: '@test/todo' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.inject', { sessionId, text: '[kvman: a hint]' }, { as: '@kvman/kvcoder' });
    await kernel.clock.advance(0);
    const before = await stored(kernel, sessionId);
    const seqs = [999, ...before.filter((message) => message.kind === 'assistant' || message.source?.kind === 'subagent' || message.source?.kind === 'extension').map((message) => message.seq ?? -1)];
    expect(seqs.length).toBeGreaterThan(4);
    for (const seq of seqs) await expect(kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'x', files: true })).rejects.toMatchObject(invalid);
    expect(await stored(kernel, sessionId)).toEqual(before);
  });

  it('QA77-E2 the three are for the person only', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'hi', says('ok'));
    const as = { as: '@test/todo' };
    const notPublic = { problem: { code: 'NOT_PUBLIC' } };
    await expect(kernel.exec('kvcoder.rewind.files.list', { sessionId, seq: 0 }, as)).rejects.toMatchObject(notPublic);
    await expect(kernel.exec('kvcoder.message.edit', { sessionId, seq: 0, text: 'x', files: true }, as)).rejects.toMatchObject(notPublic);
    await expect(kernel.exec('kvcoder.message.undo', { sessionId, files: true }, as)).rejects.toMatchObject(notPublic);
  });

  it('QA77-E4 a chat with nothing to undo is refused', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await expect(kernel.exec('kvcoder.message.undo', { sessionId, files: true })).rejects.toMatchObject(invalid);
  });

  it('QA77-E5 an edit that adds an image or an attached file is refused and rewinds nothing', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'plain', says('ok'));
    const seq = await seqOf(kernel, sessionId, 'plain');
    const before = await stored(kernel, sessionId);
    await expect(kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'x', fileIds: ['not-its-image'], files: true })).rejects.toMatchObject(invalid);
    await expect(kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'x', attachments: ['attachments/other.txt'], files: true })).rejects.toMatchObject(invalid);
    expect(await stored(kernel, sessionId)).toEqual(before);
  });
});
