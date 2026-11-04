import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says } from './support/model-script.ts';
import { readAt, seqOf, stored, turnOf, writeAt } from './support/rewind.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The preview of a rewind (plan 08 §8.6, ADR 0118, 6): what it would do to each file, how many messages would go, and
// whether the chat is busy, changing nothing.

describe('the preview of a rewind (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H5 the preview names each file with its state and counts the messages, changing nothing', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'kept.txt', 'one\n');
    writeAt(kernel, 'mine.txt', 'one\n');
    writeAt(kernel, 'big.txt', `${'x'.repeat(1024 * 1024)}\nend\n`);
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'start', says('ok'));
    const reads = runs(fsCall('read', { path: 'kept.txt' }), fsCall('read', { path: 'mine.txt' }), fsCall('read', { path: 'big.txt' }));
    const edits = runs(fsCall('edit', { path: 'kept.txt', edits: [{ oldText: 'one', newText: 'two' }] }), fsCall('edit', { path: 'mine.txt', edits: [{ oldText: 'one', newText: 'two' }] }), fsCall('edit', { path: 'big.txt', edits: [{ oldText: 'end', newText: 'stop' }] }), fsCall('write', { path: 'new.txt', content: 'n\n' }));
    await turnOf(kernel, fake, sessionId, 'change', reads, edits, says('ok'));
    writeAt(kernel, 'mine.txt', 'mine\n');
    const seq = await seqOf(kernel, sessionId, 'change');
    const before = await stored(kernel, sessionId);
    const preview = await kernel.exec('kvcoder.rewind.files.list', { sessionId, seq });
    expect(preview).toEqual({ files: [{ path: 'big.txt', state: 'tooLarge' }, { path: 'kept.txt', state: 'restore' }, { path: 'mine.txt', state: 'changedSince' }, { path: 'new.txt', state: 'delete' }], messages: before.length - before.findIndex((message) => message.seq === seq), running: false });
    expect([readAt(kernel, 'kept.txt'), readAt(kernel, 'new.txt')]).toEqual(['two\n', 'n\n']);
    expect(await stored(kernel, sessionId)).toEqual(before);
  });
});
