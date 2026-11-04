import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says } from './support/model-script.ts';
import { readAt, seqOf, stored, turnOf, writeAt } from './support/rewind.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The files of a rewind (plan 08 §8.5, ADR 0118, 2 to 4): kvman's changes after the message taken back as one, copies
// kept for the chat's life, an undo after it rewound too, and a file that changed since left as it is.

const edit = (file: string, from: string, to: string) => fsCall('edit', { path: file, edits: [{ oldText: from, newText: to }] });
const read = (file: string) => fsCall('read', { path: file });
const undo = (file: string) => command('fs', 'undo', { path: file, risky: false });

describe('the files of a rewind (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H6 several changes after the message go back as one, to what the file held at the message', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'first', runs(read('a.txt')), runs(edit('a.txt', 'one', 'two')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'second', runs(edit('a.txt', 'two', 'three')), runs(edit('a.txt', 'three', 'four')), says('ok'));
    const seq = await seqOf(kernel, sessionId, 'second');
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result.restored).toEqual(['a.txt']);
    expect(readAt(kernel, 'a.txt')).toBe('two\n');
    expect(seq).toBeGreaterThan(0);
    await turnOf(kernel, fake, sessionId, 'undo it', runs(undo('a.txt')), says('ok'));
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
  });

  it('QA77-H7 and QA77-E11 every copy is kept past 20, and changes in one frozen millisecond keep their order', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const names = Array.from({ length: 25 }, (_, index) => `f${String(index)}.txt`);
    await turnOf(kernel, fake, sessionId, 'write', ...names.map((name) => runs(fsCall('write', { path: name, content: `${name}\n` }))), runs(fsCall('write', { path: 'same.txt', content: 'b\n' })), runs(fsCall('write', { path: 'same.txt', content: 'c\n' })), says('ok'));
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result.deleted).toEqual([...names, 'same.txt'].sort());
    expect(names.every((name) => readAt(kernel, name) === undefined)).toBe(true);
  });

  it('QA77-H8 an undo after the message is rewound: the file holds what it held at the message', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'change', runs(read('a.txt')), runs(edit('a.txt', 'one', 'two')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'take it back', runs(undo('a.txt')), says('ok'));
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
    expect((await kernel.exec('kvcoder.message.undo', { sessionId, files: true })).restored).toEqual(['a.txt']);
    expect(readAt(kernel, 'a.txt')).toBe('two\n');
    await turnOf(kernel, fake, sessionId, 'undo again', runs(undo('a.txt')), says('ok'));
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
  });

  it('QA77-H16 the views go: a change without reading the file again fails', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'look', runs(read('a.txt')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'other', says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    await turnOf(kernel, fake, sessionId, 'edit blind', runs(edit('a.txt', 'one', 'two')), says('ok'));
    const results = (await stored(kernel, sessionId)).filter((message) => message.kind === 'toolResult');
    expect(JSON.stringify(results.at(-1)?.content)).toContain("hasn't read it");
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
  });

  it('QA77-E7 a file changed since is left and listed, its copies after the message go, and the others go back', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    writeAt(kernel, 'b.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'change both', runs(read('a.txt'), read('b.txt')), runs(edit('a.txt', 'one', 'two'), edit('b.txt', 'one', 'two')), says('ok'));
    writeAt(kernel, 'a.txt', 'mine\n');
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result).toMatchObject({ restored: ['b.txt'], left: [{ path: 'a.txt', reason: 'changedSince' }] });
    expect(readAt(kernel, 'a.txt')).toBe('mine\n');
    expect(readAt(kernel, 'b.txt')).toBe('one\n');
    expect((await kernel.exec('kvcoder.change.list', { sessionId, withDiffs: false })).files).toEqual([]);
  });

  it('QA77-E8 a file over 1 MB before the change keeps no copy: the rewind leaves it and fs undo says so', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'big.txt', `${'x'.repeat(1024 * 1024)}\nend\n`);
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'grow', runs(read('big.txt')), runs(edit('big.txt', 'end', 'stop')), runs(undo('big.txt')), says('ok'));
    const results = (await stored(kernel, sessionId)).filter((message) => message.kind === 'toolResult');
    expect(JSON.stringify(results.at(-1)?.content)).toContain('over 1 MB before that change, so no copy was kept');
    expect(await kernel.exec('kvcoder.message.undo', { sessionId, files: true })).toMatchObject({ left: [{ path: 'big.txt', reason: 'tooLarge' }] });
    expect(readAt(kernel, 'big.txt')?.endsWith('stop\n')).toBe(true);
  });

  it("QA77-E14 the person's own undo after the message is rewound too", async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'change', runs(read('a.txt')), runs(edit('a.txt', 'one', 'two')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'later', says('ok'));
    await kernel.exec('kvcoder.change.undo', { sessionId, path: 'a.txt' });
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
    expect((await kernel.exec('kvcoder.message.undo', { sessionId, files: true })).restored).toEqual(['a.txt']);
    expect(readAt(kernel, 'a.txt')).toBe('two\n');
  });

  it('QA77-E16 the Changes list keeps a file changed before the message and drops one changed only after it', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'first', runs(read('a.txt')), runs(edit('a.txt', 'one', 'two')), says('ok'));
    await turnOf(kernel, fake, sessionId, 'second', runs(edit('a.txt', 'two', 'three'), fsCall('write', { path: 'b.txt', content: 'b\n' })), says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect((await kernel.exec('kvcoder.change.list', { sessionId, withDiffs: false })).files.map((file) => file.path)).toEqual(['a.txt']);
    expect(readAt(kernel, 'a.txt')).toBe('two\n');
  });
});
