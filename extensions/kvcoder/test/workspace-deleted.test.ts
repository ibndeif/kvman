import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// kvcoder's background-process records are in the global store, which no query lists across workspaces: count its rows.
function processRecords(home: string): number {
  const database = new DatabaseSync(path.join(home, 'kvman.db'), { readOnly: true });
  try {
    const row = database.prepare("SELECT count(*) AS count FROM store_documents WHERE extension = '@kvman/kvcoder' AND scope = '' AND collection = 'processes'").get();
    return Number(row?.['count']);
  } finally {
    database.close();
  }
}

describe('a deleted workspace (02 §2.6, ADR 0061, 4)', { timeout: 60_000 }, () => {
  it("M2.4-E209 kvcoder forgets the background processes of a deleted workspace's chats, and leaves another workspace's", async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const folder = mkdtempSync(path.join(tmpdir(), 'kvcoder-workspace-'));
    folders.push(folder);
    const workspace = await kernel.exec('kernel.workspace.open', { path: folder });
    for (const workspaceId of [workspace.id, undefined]) {
      const at = workspaceId === undefined ? {} : { workspaceId };
      const sessionId = await newSession(kernel, workspaceId);
      fake.reply(runs(shell('sleep 30', { background: true })), says('ok'));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }, at);
      await kernel.clock.advance(0);
      await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.list', { sessionId }, at)).toHaveLength(1), wait);
    }
    expect(processRecords(kernel.home)).toBe(2);

    await kernel.exec('kernel.workspace.close', { workspaceId: workspace.id });
    await kernel.exec('kernel.workspace.delete', { workspaceId: workspace.id });
    await vi.waitFor(() => expect(processRecords(kernel.home)).toBe(1), wait);
    expect((await kernel.exec('kernel.processes.list', {})).map((running) => running.workspaceId)).toEqual(['home']);
  });
});
