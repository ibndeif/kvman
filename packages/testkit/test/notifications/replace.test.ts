import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { rows, run, valueOf } from '../workspaces/harness.ts';
import { changes, emit, emitCrier, notificationTests, openNotificationFixture, pushed, tray, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

const translating = { title: '$t.notify.translating', key: 'translate:f1' };
const translated = {
  title: '$t.notify.translated', key: 'translate:f1', level: 'success',
  actions: [{ label: 'Open', navigate: '/items/1' }],
};

describe('notification replacement and dismissal (ADRs 0162, 0163)', notificationTests, () => {
  it('M2.12-H1 a second notice with the same key replaces the first in place', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: translating }]));
    const [first] = await tray(fixture, workspaceA);
    if (first === undefined) throw new Error('the first notice left no tray entry');
    fixture.fixture.timers.advance(5000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: translated }]));
    const items = await tray(fixture, workspaceA);
    expect(items).toHaveLength(1);
    const [entry] = items;
    expect(entry).toMatchObject({
      id: first.id, source: 'ext:@acme/herald', key: 'translate:f1', level: 'success',
      title: '$t.notify.translated', actions: [{ label: 'Open', navigate: '/items/1' }],
      createdAt: first.createdAt, updatedAt: first.createdAt + 5000,
    });
    expect(rows(fixture.fixture, "SELECT state, handler, target, result FROM messages WHERE type = 'ui.notify' ORDER BY created_at")).toEqual([
      { state: 'done', handler: 'kernel', target: 'user:local', result: '{"ok":true,"value":{"ok":true}}' },
      { state: 'done', handler: 'kernel', target: 'user:local', result: '{"ok":true,"value":{"ok":true}}' },
    ]);
    expect(changes(fixture)).toEqual([{ workspaceId: workspaceA }, { workspaceId: workspaceA }]);
  });

  it('M2.12-E18 a replacement keeps the read state unless the level rises to warning or error', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'First', key: 'k' } }]));
    const [entry] = await tray(fixture, workspaceA);
    if (entry === undefined) throw new Error('the notice left no tray entry');
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Second', key: 'k', level: 'info' } }]));
    const [stayed] = await tray(fixture, workspaceA);
    expect(stayed).toMatchObject({ id: entry.id, read: true });
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Third', key: 'k', level: 'warning' } }]));
    const [unread] = await tray(fixture, workspaceA);
    expect(unread).toMatchObject({ id: entry.id, read: false, level: 'warning' });
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: entry.id }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Fourth', key: 'k', level: 'info' } }]));
    const [lowered] = await tray(fixture, workspaceA);
    expect(lowered).toMatchObject({ id: entry.id, read: true, level: 'info' });
  });

  it('M2.12-E19 the same key in each workspace, globally, and from another extension gives four entries', async () => {
    const fixture = await opened();
    for (const send of [
      emit(fixture, [{ kind: 'notify', value: { title: 'A', key: 'k' } }], { workspaceId: workspaceA }),
      emit(fixture, [{ kind: 'notify', value: { title: 'B', key: 'k' } }], { workspaceId: workspaceB }),
      emit(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'k', global: true } }], { workspaceId: workspaceA }),
      emitCrier(fixture, [{ kind: 'notify', value: { title: 'Crier', key: 'k' } }], { workspaceId: workspaceA }),
    ]) valueOf(await send);
    const every = await tray(fixture);
    expect(every.filter((item) => item.key === 'k')).toHaveLength(4);
    expect(every.filter((item) => item.key === 'k' && item.source === 'ext:@acme/herald')).toHaveLength(3);
    expect(every.filter((item) => item.key === 'k' && item.source === 'ext:@acme/crier')).toHaveLength(1);
    expect((await tray(fixture, workspaceA)).filter((item) => item.key === 'k')).toHaveLength(3);
    expect((await tray(fixture, workspaceB)).filter((item) => item.key === 'k')).toHaveLength(2);
  });

  it('M2.12-E20 a dismiss removes only the sender entry in the message workspace', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'A', key: 'k' } }], { workspaceId: workspaceA }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'B', key: 'k' } }], { workspaceId: workspaceB }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Global', key: 'k', global: true } }], { workspaceId: workspaceA }));
    valueOf(await emitCrier(fixture, [{ kind: 'notify', value: { title: 'Crier', key: 'k' } }], { workspaceId: workspaceA }));
    valueOf(await emit(fixture, [{ kind: 'dismiss', value: 'k' }], { workspaceId: workspaceA }));
    expect((await tray(fixture, workspaceA)).filter((item) => item.key === 'k')).toHaveLength(2);
    expect((await tray(fixture, workspaceB)).filter((item) => item.key === 'k')).toHaveLength(2);
    expect(pushed(fixture).filter((push) => push.type === 'ui.dismiss')).toEqual([
      { workspaceId: workspaceA, type: 'ui.dismiss', source: 'ext:@acme/herald', payload: { key: 'k' } },
    ]);
    expect(changes(fixture)).toEqual([
      { workspaceId: workspaceA }, { workspaceId: workspaceB }, {}, { workspaceId: workspaceA }, { workspaceId: workspaceA },
    ]);
  });

  it('M2.12-E21 a repeated dismiss publishes no change, and the key starts a fresh entry after it', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'A', key: 'k' } }], { workspaceId: workspaceA }));
    const [entry] = await tray(fixture, workspaceA);
    if (entry === undefined) throw new Error('the notice left no tray entry');
    valueOf(await emit(fixture, [{ kind: 'dismiss', value: 'k' }], { workspaceId: workspaceA }));
    const pushes = pushed(fixture).length;
    const announced = changes(fixture).length;
    valueOf(await emit(fixture, [{ kind: 'dismiss', value: 'k' }], { workspaceId: workspaceA }));
    expect(pushed(fixture)).toHaveLength(pushes + 1);
    expect(pushed(fixture).at(-1)).toMatchObject({ type: 'ui.dismiss', payload: { key: 'k' } });
    expect(changes(fixture)).toHaveLength(announced);
    fixture.fixture.timers.advance(1000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Again', key: 'k' } }], { workspaceId: workspaceA }));
    const [fresh] = await tray(fixture, workspaceA);
    expect(fresh).toMatchObject({ key: 'k', title: 'Again', read: false });
    if (fresh === undefined) throw new Error('the re-sent notice left no tray entry');
    expect(fresh.id).not.toBe(entry.id);
    expect(fresh.createdAt).toBeGreaterThan(entry.createdAt);
  });
});
