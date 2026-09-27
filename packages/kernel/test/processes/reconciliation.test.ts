import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupAlive, insertProcess, processStartOf, reconcileProcesses, signalGroup } from '../../src/index.ts';
import { causeMessage } from '../router/harness.ts';
import { now, ulids } from '../storage/harness.ts';
import { gone, openProcessFixture, startedGroup } from './harness.ts';

describe('boot reconciliation (plan 03 §3.9 step 6, ADR 0139)', () => {
  it('M2.6-E36 a reused PID survives, a matching group is killed, and both rows end with their logs', async () => {
    const fixture = openProcessFixture();
    const cause = await causeMessage(fixture, 'pdf.archive');
    const reused = startedGroup();
    const matching = startedGroup();
    const rows = [
      { pid: reused, processStart: 'Thu Jan  1 00:00:00 1970', log: 'reused\n' },
      { pid: matching, processStart: processStartOf(matching) ?? 'unknown', log: 'matching\n' },
    ].map(({ pid, processStart, log }) => {
      const processId = ulids.next();
      const logPath = join(fixture.home, `${processId}.log`);
      writeFileSync(logPath, log);
      insertProcess(fixture.connection, {
        processId, messageId: cause.id, extension: '@acme/pdf', workspaceId: cause.workspaceId, command: 'sleep', pid, processStart, logPath, detached: false,
        onExit: undefined, spawnedBy: cause, startedAt: now(),
      });
      return { processId, log };
    });

    expect(await reconcileProcesses({ connection: fixture.connection, store: fixture.store, pipeline: fixture.pipeline, logger: { write: () => undefined }, timers: fixture.timers, now })).toBe(2);

    await gone(matching);
    expect(groupAlive(reused)).toBe(true);
    for (const { processId, log } of rows) {
      const [row] = fixture.connection.prepare('SELECT state, reason, log_blob FROM processes WHERE id = ?').all(processId);
      expect(row).toMatchObject({ state: 'killed', reason: 'kernel-restart' });
      const blobId = String(row?.['log_blob']);
      expect((await fixture.store.read(blobId, 0, 100)).toString('utf8')).toBe(log);
      expect(fixture.connection.prepare('SELECT owner FROM blob_refs WHERE ref = ?').all(`process:${processId}`)).toEqual([{ owner: 'kernel' }]);
    }
    signalGroup(reused, 'SIGKILL');
    await gone(reused);
  });
});
