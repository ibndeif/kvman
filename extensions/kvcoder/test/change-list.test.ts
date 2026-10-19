import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { initRepository, stage, git } from './support/git-folder.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

// A chat's changes (08 §8.6, ADR 0093, 2): the files its tree changed with fs, diffed with Git, and the person's undo.
const listed = (kernel: TestKernel, sessionId: string) => kernel.exec('kvcoder.change.list', { sessionId });

async function chat(kernel: TestKernel, fake: Awaited<ReturnType<typeof kvcoder.start>>['fake'], ...replies: Parameters<typeof fake.reply>): Promise<string> {
  const sessionId = await newSession(kernel);
  fake.reply(...replies);
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return sessionId;
}

// A helper's session id, read from the test kernel's database.
function childOf(kernel: TestKernel, sessionId: string): string {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
  try {
    const row = database.prepare("SELECT id FROM store_documents WHERE extension = '@kvman/kvcoder' AND collection = 'sessions' AND json_extract(data, '$.parentId') = ?").get(sessionId);
    return typeof row?.['id'] === 'string' ? row['id'] : '';
  } finally {
    database.close();
  }
}

const pathBefore = process.env['PATH'];
afterEach(() => {
  process.env['PATH'] = pathBefore;
});

describe("a chat's changes (ADR 0093, 2)", { timeout: 60_000 }, () => {
  it("QA61-H4 and QA61-H5 a tracked edit, a new file, and a helper's file are listed newest first with diffs, and undo takes the edit back", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const folder = kernel.homeFolder;
    initRepository(folder);
    stage(folder, 'app.ts', 'one\n');
    git(folder, '-c', 'user.name=P', '-c', 'user.email=p@example.test', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'app');
    const sessionId = await chat(
      kernel,
      fake,
      runs(fsCall('read', { path: 'app.ts' })),
      runs(fsCall('edit', { path: 'app.ts', edits: [{ oldText: 'one', newText: 'two' }] }), fsCall('write', { path: 'new.ts', content: 'fresh\n' })),
      runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Write it' })),
      runs(fsCall('write', { path: 'helper.ts', content: 'from the helper\n' })),
      says('written'),
      says('done'),
    );
    const { files, diffs } = await listed(kernel, sessionId);
    expect(diffs).toBe(true);
    expect(files.map((file) => [file.path, file.state, file.added, file.removed])).toEqual([['helper.ts', 'created', 1, 0], ['new.ts', 'created', 1, 0], ['app.ts', 'changed', 1, 1]]);
    expect(files[2]?.diff).toContain('--- a/app.ts\n+++ b/app.ts\n@@');
    expect(files[2]?.diff).toContain('\n-one\n+two');
    await kernel.exec('kvcoder.change.undo', { sessionId, path: 'app.ts' });
    expect(readFileSync(path.join(folder, 'app.ts'), 'utf8')).toBe('one\n');
  });

  it('QA61-E4 outside Git a change is diffed against the oldest kept copy, a removed file is deleted, and without Git the files are listed', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'a.txt'), 'first\n');
    const sessionId = await chat(
      kernel,
      fake,
      runs(fsCall('read', { path: 'a.txt' })),
      runs(fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'first', newText: 'second' }] }), fsCall('write', { path: 'gone.txt', content: 'x\n' })),
      runs(fsCall('read', { path: 'a.txt' })),
      runs(fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'second', newText: 'third' }] }), command('fs', 'undo', { path: 'gone.txt', risky: false })),
      says('done'),
    );
    const { files } = await listed(kernel, sessionId);
    expect(files.map((file) => [file.path, file.state])).toEqual([['gone.txt', 'deleted'], ['a.txt', 'changed']]);
    expect(files[1]?.diff).toContain('\n-first\n+third');
    process.env['PATH'] = path.dirname(process.execPath);
    const { kernel: bare, fake: bareFake } = await kvcoder.start();
    const bareId = await chat(bare, bareFake, runs(fsCall('write', { path: 'b.txt', content: 'x\n' })), says('done'));
    expect(await listed(bare, bareId)).toEqual({ files: [{ path: 'b.txt', state: 'created', added: 0, removed: 0, diff: '' }], diffs: false });
  });

  it('QA61-E5 a diff over 64 KB is cut, and the records go with the chat', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await chat(kernel, fake, runs(fsCall('write', { path: 'big.txt', content: 'line of text\n'.repeat(7000) })), says('done'));
    const [big] = (await listed(kernel, sessionId)).files;
    expect(big?.diff.endsWith('\n[… cut at 64 KB …]')).toBe(true);
    expect(big?.added).toBe(7000);
    await kernel.exec('kvcoder.session.delete', { sessionId });
    const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
    try {
      expect(database.prepare("SELECT count(*) AS count FROM store_documents WHERE extension = '@kvman/kvcoder' AND collection = 'file-changes'").get()).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it("QA61-E6 undo is refused for a file changed since, a file with no kept change, and a helper's chat", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const sessionId = await chat(kernel, fake, runs(fsCall('write', { path: 'a.txt', content: 'mine\n' })), runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Look' })), says('looked'), says('done'));
    writeFileSync(path.join(kernel.homeFolder, 'a.txt'), 'changed by hand\n');
    await expect(kernel.exec('kvcoder.change.undo', { sessionId, path: 'a.txt' })).rejects.toMatchObject({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) as unknown });
    await expect(kernel.exec('kvcoder.change.undo', { sessionId, path: 'never.txt' })).rejects.toMatchObject({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) as unknown });
    const helperId = childOf(kernel, sessionId);
    expect(helperId).not.toBe('');
    await expect(kernel.exec('kvcoder.change.undo', { sessionId: helperId, path: 'a.txt' })).rejects.toMatchObject({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) as unknown });
    expect(existsSync(path.join(kernel.homeFolder, 'a.txt'))).toBe(true);
  });
});
