import { collectIntervalMs } from '@kvman/kernel';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import {
  changes, emit, emitGlobal, notificationTests, openNotificationFixture, tray,
  type NotificationFixture,
} from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

const dayMs = 24 * 60 * 60_000;

describe('notification retention (ADR 0163)', notificationTests, () => {
  it('M2.12-E37 housekeeping trims expired, dismissed, long-read, and stale entries', async () => {
    const fixture = await opened();
    const start = fixture.fixture.timers.time.value;
    for (const key of ['expired', 'dismissed', 'read8', 'read6', 'stale', 'kept']) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: key, key } }]));
    }
    const ids = new Map((await tray(fixture, workspaceA)).map((item) => [item.key, item.id]));
    const idOf = (key: string): string => {
      const id = ids.get(key);
      if (id === undefined) throw new Error(`no tray entry ${key}`);
      return id;
    };
    const database = fixture.fixture.connection;
    database.prepare('UPDATE notifications SET expires_at = ? WHERE id = ?').run(start - 1, idOf('expired'));
    database.prepare('UPDATE notifications SET dismissed_at = ? WHERE id = ?').run(start, idOf('dismissed'));
    database.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(start - 8 * dayMs, idOf('read8'));
    database.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(start - 6 * dayMs, idOf('read6'));
    database.prepare('UPDATE notifications SET updated_at = ? WHERE id = ?').run(start - 31 * dayMs, idOf('stale'));
    database.prepare('UPDATE notifications SET updated_at = ? WHERE id = ?').run(start - 29 * dayMs, idOf('kept'));
    const announced = changes(fixture).length;
    fixture.fixture.timers.advance(collectIntervalMs);
    await fixture.fixture.runtime.files.collector.idle();
    expect((await tray(fixture, workspaceA)).map((item) => item.key).sort()).toEqual(['kept', 'read6']);
    expect(changes(fixture).slice(announced)).toEqual([{ workspaceId: workspaceA }]);
  });

  it('M2.12-E38 the 200-entry cap drops the oldest entry of the workspace', async () => {
    const fixture = await opened();
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'global' } }]));
    for (let index = 1; index <= 200; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `cap:${index}` } }]));
      fixture.fixture.timers.advance(7000);
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Notice 201', key: 'cap:201' } }]));
    const inA = await tray(fixture, workspaceA);
    expect(inA.filter((item) => item.workspaceId === workspaceA)).toHaveLength(200);
    expect(inA.map((item) => item.key)).toContain('cap:201');
    expect(inA.map((item) => item.key)).not.toContain('cap:1');
    expect((await tray(fixture)).some((item) => item.key === 'global')).toBe(true);
  });
});
