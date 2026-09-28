import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { query, rows, run, valueOf } from '../workspaces/harness.ts';
import {
  changes, count, emit, emitCrier, emitGlobal, notificationTests, openNotificationFixture, pushed, tray,
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

function storedMuted(fixture: NotificationFixture): unknown {
  const [row] = rows(fixture.fixture, 'SELECT data FROM user_preferences WHERE user_id = ?', 'local');
  if (row === undefined) throw new Error('no stored preferences row');
  const parsed: unknown = JSON.parse(String(row['data']));
  if (typeof parsed !== 'object' || parsed === null || !('muted' in parsed)) throw new Error('no stored muted list');
  return parsed.muted;
}

describe('notification muting (ADR 0163)', notificationTests, () => {
  it('M2.12-E34 a muted extension is listed as muted, uncounted, and unpushed in that workspace', async () => {
    const fixture = await opened();
    const announced = changes(fixture).length;
    expect(valueOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: true }))).toEqual({});
    expect(changes(fixture).slice(announced)).toEqual([{ workspaceId: workspaceA }]);
    valueOf(await emit(fixture, [{ kind: 'toast', value: { text: 'Muted toast' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Muted', key: 'm' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In B', key: 'b' } }], { workspaceId: workspaceB }));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'g' } }]));
    valueOf(await emitCrier(fixture, [{ kind: 'notify', value: { title: 'Crier', key: 'c' } }]));
    const entry = (await tray(fixture, workspaceA)).find((item) => item.key === 'm');
    expect(entry).toMatchObject({ source: 'ext:@acme/herald', muted: true, read: false });
    expect(await count(fixture, workspaceA)).toEqual({ unread: 2, attention: 0 });
    expect(pushed(fixture).filter((push) => push.source === 'ext:@acme/herald' && 'workspaceId' in push && push.workspaceId === workspaceA)).toEqual([]);
    expect(pushed(fixture)).toHaveLength(3);
  });

  it('M2.12-E35 unmuting counts the entry again and pushes the next notice', async () => {
    const fixture = await opened();
    valueOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: true }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Muted', key: 'm' } }]));
    expect(valueOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: false }))).toEqual({});
    expect((await tray(fixture, workspaceA)).find((item) => item.key === 'm')).toMatchObject({ muted: false });
    expect(await count(fixture, workspaceA)).toEqual({ unread: 1, attention: 0 });
    const pushes = pushed(fixture).length;
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Again', key: 'm2' } }]));
    expect(pushed(fixture)).toHaveLength(pushes + 1);
    expect(pushed(fixture).at(-1)).toMatchObject({ type: 'ui.notify', workspaceId: workspaceA });
  });

  it('M2.12-E36 muting refuses unknown names, keeps a second mute quiet, and hides muted from get', async () => {
    const fixture = await opened();
    const unknownWorkspace = 'c'.repeat(64);
    expect(problemOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: unknownWorkspace, extension: '@acme/herald', muted: true })).code)
      .toBe('WORKSPACE_INVALID');
    expect(problemOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/none', muted: true })).code)
      .toBe('NOT_FOUND');
    expect(problemOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: 'kernel', muted: true })).code)
      .toBe('NOT_FOUND');
    valueOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: true }));
    const announced = changes(fixture).length;
    expect(valueOf(await run(fixture.fixture, 'kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: true }))).toEqual({});
    expect(changes(fixture)).toHaveLength(announced);
    expect(storedMuted(fixture)).toEqual({ [workspaceA]: ['@acme/herald'] });
    valueOf(await run(fixture.fixture, 'kernel.user.preferences.set', { theme: 'dark' }));
    expect(storedMuted(fixture)).toEqual({ [workspaceA]: ['@acme/herald'] });
    const preferences = await query(fixture.fixture, 'kernel.user.preferences.get', {});
    expect(preferences).toMatchObject({ ok: true, value: { locale: 'en', theme: 'dark', desktopAlerts: false } });
    if (typeof preferences !== 'object' || preferences === null || !('value' in preferences)) throw new Error('no preferences value');
    expect(preferences.value).not.toHaveProperty('muted');
  });
});
