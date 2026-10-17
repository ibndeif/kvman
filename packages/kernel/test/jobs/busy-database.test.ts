import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTrust } from '../../src/extensions/trust.ts';
import { readExtension } from '../../src/extensions/manifests.ts';
import { createIdGenerator } from '../../src/ids.ts';
import { createWorkspaces } from '../../src/workspaces/workspaces.ts';
import { countingRandom, timerClock } from '../fake-clock.ts';
import { captureLog } from '../log-capture.ts';
import { useTemporaryHomes } from '../temporary-home.ts';
import { answeringPool, dispatcherParts, dueSchedule, jobsNamed } from './dispatcher-parts.ts';

// A main-thread transaction that reads and then writes waits for another connection's write (plan 02 §2.2, ADR 0085,
// 6). Before the fix, these tests failed: a deferred transaction that read first got SQLITE_BUSY at once.

const newHome = useTemporaryHomes();
const sqlite = createRequire(import.meta.url).resolve('better-sqlite3');
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// The other connection is a separate thread, so its real 300 ms hold is what the test is about, not a hidden race.
const holder = `
const { workerData, parentPort } = require('node:worker_threads');
const Database = require(workerData.sqlite);
const db = new Database(workerData.file);
db.pragma('busy_timeout = 5000');
db.exec('CREATE TABLE IF NOT EXISTS scratch (n INTEGER)');
db.exec('BEGIN IMMEDIATE');
db.prepare('INSERT INTO scratch VALUES (1)').run();
parentPort.postMessage('locked');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.holdMs);
db.exec('COMMIT');
db.close();
`;

async function holdWriteLock(file: string): Promise<Worker> {
  const worker = new Worker(holder, { eval: true, workerData: { sqlite, file, holdMs: 300 } });
  await new Promise<void>((resolve, reject) => {
    worker.once('message', () => resolve());
    worker.once('error', reject);
  });
  return worker;
}

describe('main-thread writes wait for a busy database (ADR 0085, 6)', () => {
  it('QA53-H1 a schedule falls due while a worker writes', async () => {
    const home = newHome();
    const clock = timerClock();
    const { dispatcher, schedules } = dispatcherParts(home.connection, home.connection, clock, captureLog().logger);
    dispatcher.attach(answeringPool(0, null), []);
    const id = dueSchedule(schedules, clock);
    const worker = await holdWriteLock(home.database);
    try {
      expect(() => dispatcher.wake()).not.toThrow();
    } finally {
      await worker.terminate();
    }
    expect(jobsNamed(home.connection, 'x.tick')).toBe(1);
    const nextRun = home.connection.prepare<[string], { next_run: string }>('SELECT next_run FROM schedules WHERE id = ?').get(id)?.next_run;
    expect(Date.parse(nextRun ?? '')).toBeGreaterThan(clock.now());
  });

  it('QA53-H2 a transaction that reads first waits too', async () => {
    const home = newHome();
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-folder-'));
    folders.push(folder);
    const workspaces = createWorkspaces(home.connection, home.home, createIdGenerator(home.clock, countingRandom()));
    const extensionFolder = path.join(folder, 'x');
    mkdirSync(extensionFolder);
    writeFileSync(path.join(extensionFolder, 'package.json'), JSON.stringify({ name: '@test/x', version: '1.0.0', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'x' } }));
    const extension = readExtension('@test/x', 'path:./x', { home: home.home, presetFolder: folder, bundled: new Map() });
    let worker = await holdWriteLock(home.database);
    try {
      const opened = workspaces.open(folder, () => undefined);
      expect(home.connection.prepare<[string], { path: string }>('SELECT path FROM workspaces WHERE id = ?').get(opened.id)?.path).toBe(opened.path);
    } finally {
      await worker.terminate();
    }
    worker = await holdWriteLock(home.database);
    try {
      await checkTrust(home.connection, home.clock, [extension], () => Promise.resolve(true));
    } finally {
      await worker.terminate();
    }
    expect(home.connection.prepare('SELECT name FROM accepted_extensions').all()).toEqual([{ name: '@test/x' }]);
  });
});
