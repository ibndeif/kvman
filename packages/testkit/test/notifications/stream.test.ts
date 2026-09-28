import { notificationsChangedSchema, sseMessageSchemas } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, sendAs } from '../install/harness.ts';
import { eventsOf, rows, valueOf } from '../workspaces/harness.ts';
import { RecordingSink } from './stream-sink.ts';
import {
  changes, emit, emitGlobal, notificationTests, openNotificationFixture, pushed, tab, tray,
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

describe('notification targets and the stream (ADRs 0162, 0163)', notificationTests, () => {
  it('M2.12-E13 toasts go to the tab that started the correlation, else to the person', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'toast', value: { text: 'From the tab' } }], { sender: tab }));
    valueOf(await command(fixture.fixture, 'herald.relay', { sends: [{ kind: 'toast', value: { text: 'Relayed' } }] }, tab, workspaceA));
    valueOf(await emit(fixture, [{ kind: 'toast', value: { text: 'Without a tab' } }], { sender: person }));
    const toastPushes = pushed(fixture).filter((push) => push.type === 'ui.toast');
    expect(toastPushes).toHaveLength(3);
    for (const push of toastPushes) {
      expect(push).toMatchObject({ type: 'ui.toast', source: 'ext:@acme/herald', workspaceId: workspaceA });
    }
    expect(toastPushes.at(0)).toMatchObject({ clientId: 'c1' });
    expect(toastPushes.at(1)).toMatchObject({ clientId: 'c1' });
    expect(toastPushes.at(2)).not.toHaveProperty('clientId');
    expect(rows(fixture.fixture, "SELECT target FROM messages WHERE type = 'ui.toast' ORDER BY created_at")).toEqual([
      { target: 'user:local/client:c1' },
      { target: 'user:local/client:c1' },
      { target: 'user:local' },
    ]);
  });

  it('M2.12-E14 a navigate without a tab is stored but not pushed', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'navigate', value: '/items/1' }], { sender: tab }));
    valueOf(await emit(fixture, [{ kind: 'navigate', value: '/items/1' }], { sender: person }));
    const navigates = pushed(fixture).filter((push) => push.type === 'ui.navigate');
    expect(navigates).toHaveLength(1);
    expect(navigates.at(0)).toMatchObject({ clientId: 'c1', workspaceId: workspaceA, type: 'ui.navigate' });
    expect(rows(fixture.fixture, "SELECT target FROM messages WHERE type = 'ui.navigate' ORDER BY created_at")).toEqual([
      { target: 'user:local/client:c1' },
      { target: 'user:local' },
    ]);
  });

  it('M2.12-E15 a global notice is pushed without a workspace and stored with an empty one', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done' } }]));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: '$t.notify.done' } }]));
    const notifies = pushed(fixture).filter((push) => push.type === 'ui.notify');
    expect(notifies).toHaveLength(2);
    expect(notifies.at(0)).toMatchObject({ workspaceId: workspaceA, type: 'ui.notify' });
    expect(notifies.at(1)).toMatchObject({ type: 'ui.notify' });
    expect(notifies.at(1)).not.toHaveProperty('workspaceId');
    for (const push of notifies) expect(sseMessageSchemas.ui.parse(push)).toEqual(push);
    expect(await tray(fixture, workspaceA)).toHaveLength(2);
  });

  it('M2.12-E16 a run that fails retryably after its sends pushes and stores nothing', async () => {
    const fixture = await opened();
    const sends = [{ kind: 'toast', value: { text: 'Made' } }, { kind: 'notify', value: { title: '$t.notify.done' } }];
    await sendAs(fixture.fixture, person, 'herald.emit-then-fail', { sends }, workspaceA);
    await eventually(() => expect(rows(fixture.fixture, "SELECT state, attempts FROM messages WHERE type = 'herald.emit-then-fail'")).toEqual([{ state: 'pending', attempts: 1 }]));
    expect(rows(fixture.fixture, "SELECT COUNT(*) AS stored FROM messages WHERE type LIKE 'ui.%'")).toEqual([{ stored: 0 }]);
    expect(pushed(fixture)).toEqual([]);
    expect(await tray(fixture, workspaceA)).toEqual([]);
    expect(changes(fixture)).toEqual([]);
  });

  it('M2.12-E17 a workspace subscription gets the tray changes without event rows', async () => {
    const fixture = await opened();
    const scoped = new RecordingSink();
    fixture.hub.connect('B', scoped, undefined);
    if (fixture.hub.subscribe({ stream: 'B', sid: 'b-tray', events: ['kernel.notifications.changed'], workspaceId: workspaceB }) !== 'subscribed') {
      throw new Error('stream B did not subscribe to kernel.notifications.changed');
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: '$t.notify.done' } }]));
    valueOf(await emitGlobal(fixture, [{ kind: 'notify', value: { title: '$t.notify.done' } }]));
    const payloads: Array<{ workspaceId?: string }> = [];
    for (const message of scoped.messages) {
      if (message.event !== 'event') continue;
      const parsed = sseMessageSchemas.event.parse(message.data);
      if (parsed.sid !== 'b-tray' || parsed.event.type !== 'kernel.notifications.changed') continue;
      payloads.push(notificationsChangedSchema.parse(parsed.event.payload));
    }
    expect(payloads).toEqual([{ workspaceId: workspaceA }, {}]);
    expect(eventsOf(fixture.fixture, 'kernel.notifications.changed')).toEqual([]);
  });
});
