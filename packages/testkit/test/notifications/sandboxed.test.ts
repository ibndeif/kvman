import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { rows, valueOf } from '../workspaces/harness.ts';
import {
  changes, emit, notificationTests, openNotificationFixture, pushed, tray,
  type NotificationFixture,
} from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe('notifications from the sandboxed host (ADR 0162)', notificationTests, () => {
  it('M2.12-E49 a sandboxed sender stores and pushes exactly as from the shared host', async () => {
    current = await openNotificationFixture({ herald: 'sandboxed' });
    const fixture: NotificationFixture = current;
    valueOf(await emit(fixture, [{ kind: 'toast', value: { text: 'Hello' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done', key: 's' } }]));
    valueOf(await emit(fixture, [{ kind: 'dismiss', value: 's' }]));
    valueOf(await emit(fixture, [{ kind: 'navigate', value: '/items/1' }]));
    expect(pushed(fixture).filter((push) => push.type === 'ui.toast')).toEqual([
      { workspaceId: workspaceA, type: 'ui.toast', source: 'ext:@acme/herald', payload: { text: 'Hello' } },
    ]);
    expect(pushed(fixture).filter((push) => push.type === 'ui.notify')).toEqual([
      { workspaceId: workspaceA, type: 'ui.notify', source: 'ext:@acme/herald', payload: { title: '$t.notify.done', key: 's' } },
    ]);
    expect(pushed(fixture).filter((push) => push.type === 'ui.dismiss')).toEqual([
      { workspaceId: workspaceA, type: 'ui.dismiss', source: 'ext:@acme/herald', payload: { key: 's' } },
    ]);
    expect(pushed(fixture).filter((push) => push.type === 'ui.navigate')).toEqual([]);
    expect(await tray(fixture, workspaceA)).toEqual([]);
    expect(rows(fixture.fixture, "SELECT type, state, handler, target FROM messages WHERE type LIKE 'ui.%' ORDER BY created_at")).toEqual([
      { type: 'ui.toast', state: 'done', handler: 'kernel', target: 'user:local' },
      { type: 'ui.notify', state: 'done', handler: 'kernel', target: 'user:local' },
      { type: 'ui.dismiss', state: 'done', handler: 'kernel', target: 'user:local' },
      { type: 'ui.navigate', state: 'done', handler: 'kernel', target: 'user:local' },
    ]);
    expect(changes(fixture)).toEqual([{ workspaceId: workspaceA }, { workspaceId: workspaceA }]);
  });
});
