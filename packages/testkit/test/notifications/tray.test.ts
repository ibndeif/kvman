import { notificationItemSchema, notificationsListResultSchema, sseMessageSchemas } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { person, problemOf } from '../install/harness.ts';
import { query, run, valueOf } from '../workspaces/harness.ts';
import { RecordingSink } from './stream-sink.ts';
import {
  changes, count, emit, emitGlobal, heraldCall, notificationTests, openNotificationFixture, tray,
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

const unknownId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('the notification tray (ADR 0163)', notificationTests, () => {
  it('M2.12-E27 the tray lists a workspace with its global entries, newest first, attention pinned', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Old', key: 'old', attention: true } }]));
    fixture.fixture.timers.advance(1000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Second', key: 'a2' } }]));
    fixture.fixture.timers.advance(1000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Third', key: 'a3' } }]));
    fixture.fixture.timers.advance(1000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In B', key: 'b' } }], { workspaceId: workspaceB }));
    fixture.fixture.timers.advance(1000);
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'g' } }]));
    expect((await tray(fixture, workspaceA)).map((item) => item.title)).toEqual(['Old', 'Global', 'Third', 'Second']);
    expect((await tray(fixture)).map((item) => item.title)).toEqual(['Old', 'Global', 'In B', 'Third', 'Second']);
    const third = (await tray(fixture, workspaceA)).find((item) => item.key === 'a3');
    if (third === undefined) throw new Error('the third notice left no tray entry');
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: third.id }));
    const unreadAnswer = await query(fixture.fixture, 'kernel.notifications.list', { workspaceId: workspaceA, unreadOnly: true }, person, undefined);
    if (typeof unreadAnswer !== 'object' || unreadAnswer === null || !('value' in unreadAnswer)) {
      throw new Error('kernel.notifications.list did not answer');
    }
    const unread = notificationsListResultSchema.parse(unreadAnswer.value).items;
    expect(unread.map((item) => item.title)).toEqual(['Old', 'Global', 'Second']);
  });

  it('M2.12-E28 every listed item parses, and a bare global notice carries its defaults', async () => {
    const fixture = await opened();
    const expiresAt = fixture.fixture.timers.time.value + 60_000;
    valueOf(await emit(fixture, [{
      kind: 'notify',
      value: {
        title: '$t.notify.done', body: 'Translated', level: 'warning', key: 'full',
        problem: { code: 'INTERNAL', title: 'Failed', retryable: false, correlationId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' },
        entity: { type: 'herald.item', id: 'e1' }, actions: [{ label: 'Redo', command: 'herald.redo' }],
        attention: true, expiresAt,
      },
    }]));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Bare' } }]));
    const items = await tray(fixture);
    expect(items).toHaveLength(2);
    for (const item of items) expect(notificationItemSchema.parse(item)).toEqual(item);
    expect(items.find((item) => item.key === 'full')).toMatchObject({
      source: 'ext:@acme/herald', level: 'warning', body: 'Translated', route: '/items/e1',
      entity: { type: 'herald.item', id: 'e1' }, attention: true, expiresAt, read: false, muted: false,
    });
    const bare = items.find((item) => item.title === 'Bare');
    expect(bare).toMatchObject({ level: 'info', attention: false, read: false, muted: false });
    expect(bare).not.toHaveProperty('workspaceId');
    expect(bare).not.toHaveProperty('key');
  });

  it('M2.12-E29 an expired entry leaves the list and the counts without housekeeping', async () => {
    const fixture = await opened();
    const start = fixture.fixture.timers.time.value;
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done', key: 'short', expiresAt: start + 10_000 } }]));
    expect(await tray(fixture, workspaceA)).toHaveLength(1);
    fixture.fixture.timers.advance(10_001);
    expect(await tray(fixture, workspaceA)).toEqual([]);
    expect(await count(fixture, workspaceA)).toEqual({ unread: 0, attention: 0 });
  });

  it('M2.12-E30 the counts cover the workspace with its global entries, as a new hello does', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'First', key: 'a1' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Second', key: 'a2', attention: true } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Third', key: 'a3' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In B', key: 'b' } }], { workspaceId: workspaceB }));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'g' } }]));
    const third = (await tray(fixture, workspaceA)).find((item) => item.key === 'a3');
    if (third === undefined) throw new Error('the third notice left no tray entry');
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: third.id }));
    expect(await count(fixture, workspaceA)).toEqual({ unread: 3, attention: 1 });
    expect(await count(fixture)).toEqual({ unread: 4, attention: 1 });
    const fresh = new RecordingSink();
    fixture.hub.connect('T', fresh, undefined);
    const hello = fresh.messages.find((message) => message.event === 'hello');
    if (hello === undefined) throw new Error('the new stream got no hello');
    expect(sseMessageSchemas.hello.parse(hello.data)).toMatchObject({ notifications: { unread: 4, attention: 1 } });
  });

  it('M2.12-E31 reading twice changes nothing, and dismissed or unknown ids fail NOT_FOUND', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done', key: 'k' } }]));
    const [entry] = await tray(fixture, workspaceA);
    if (entry === undefined) throw new Error('the notice left no tray entry');
    const announced = changes(fixture).length;
    expect(valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id }))).toEqual({});
    expect(changes(fixture)).toHaveLength(announced + 1);
    expect(valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id }))).toEqual({});
    expect(changes(fixture)).toHaveLength(announced + 1);
    expect(valueOf(await run(fixture.fixture, 'kernel.notification.dismiss', { id: entry.id }))).toEqual({});
    expect(await tray(fixture, workspaceA)).toEqual([]);
    expect(problemOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id })).code).toBe('NOT_FOUND');
    expect(problemOf(await run(fixture.fixture, 'kernel.notification.dismiss', { id: entry.id })).code).toBe('NOT_FOUND');
    expect(problemOf(await run(fixture.fixture, 'kernel.notification.read', { id: unknownId })).code).toBe('NOT_FOUND');
  });

  it('M2.12-E32 read-all marks its scope read and publishes a change per workspace', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In A', key: 'a' } }]));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In B', key: 'b' } }], { workspaceId: workspaceB }));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'g' } }]));
    const announced = changes(fixture).length;
    valueOf(await run(fixture.fixture, 'kernel.notifications.read-all', { workspaceId: workspaceA }));
    expect((await tray(fixture, workspaceA)).every((item) => item.read)).toBe(true);
    expect((await tray(fixture, workspaceB)).find((item) => item.key === 'b')).toMatchObject({ read: false });
    expect(changes(fixture).slice(announced)).toEqual([{}, { workspaceId: workspaceA }]);
    valueOf(await run(fixture.fixture, 'kernel.notifications.read-all', {}));
    expect((await tray(fixture)).every((item) => item.read)).toBe(true);
    expect(changes(fixture).slice(announced + 2)).toEqual([{ workspaceId: workspaceB }]);
  });

  it('M2.12-E33 an extension may count but not list, read, dismiss, or mute', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done', key: 'k' } }]));
    expect(valueOf(await heraldCall(fixture, 'kernel.notifications.list', { workspaceId: workspaceA }, 'query')))
      .toEqual({ code: 'CAPABILITY_DENIED' });
    expect(valueOf(await heraldCall(fixture, 'kernel.notifications.count', { workspaceId: workspaceA }, 'query')))
      .toEqual({ result: { unread: 1, attention: 0 } });
    for (const [type, payload] of [
      ['kernel.notification.read', { id: unknownId }],
      ['kernel.notification.dismiss', { id: unknownId }],
      ['kernel.notifications.read-all', { workspaceId: workspaceA }],
      ['kernel.notifications.mute', { workspaceId: workspaceA, extension: '@acme/herald', muted: true }],
    ] as const) {
      expect(valueOf(await heraldCall(fixture, type, payload, 'command'))).toEqual({ code: 'CALLER_NOT_ALLOWED' });
    }
  });
});
