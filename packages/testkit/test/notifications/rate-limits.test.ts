import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { rows, run, valueOf } from '../workspaces/harness.ts';
import {
  changes, emit, emitCrier, notificationTests, openNotificationFixture, pushed, tray,
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

function foldedOf(items: Awaited<ReturnType<typeof tray>>): (typeof items)[number] {
  const folded = items.find((item) => item.folded !== undefined);
  if (folded === undefined) throw new Error('no folded entry in the tray');
  return folded;
}

function uiRows(fixture: NotificationFixture): Array<Record<string, unknown>> {
  return rows(fixture.fixture, "SELECT type, state FROM messages WHERE type LIKE 'ui.%' ORDER BY created_at");
}

describe('notification rate limits and folding (ADR 0162)', notificationTests, () => {
  it('M2.12-H3 the 11th and 12th notices in a minute fold into one entry', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'First', key: 'n1' } }]));
    for (let index = 2; index <= 10; index += 1) {
      fixture.fixture.timers.advance(1000);
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `n${index}` } }]));
    }
    fixture.fixture.timers.advance(21_000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Eleventh', key: 'n11' } }]));
    fixture.fixture.timers.advance(1000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Twelfth', key: 'n12' } }]));
    const items = await tray(fixture, workspaceA);
    expect(items).toHaveLength(11);
    expect(items.filter((item) => item.key !== undefined).map((item) => item.key).sort()).toEqual(
      ['n1', 'n10', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'],
    );
    const folded = foldedOf(items);
    expect(folded).toMatchObject({ source: 'ext:@acme/herald', workspaceId: workspaceA, folded: 2 });
    expect(folded).not.toHaveProperty('key');
    expect(folded).not.toHaveProperty('title');
    expect(pushed(fixture).filter((push) => push.type === 'ui.notify')).toHaveLength(10);
  });

  it('M2.12-E22 the 21st toast and the 11th notice fold into one entry', async () => {
    const fixture = await opened();
    for (let index = 1; index <= 20; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'toast', value: { text: `Toast ${index}` } }]));
    }
    valueOf(await emit(fixture, [{ kind: 'toast', value: { text: 'Toast 21' } }]));
    for (let index = 1; index <= 10; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `m${index}` } }]));
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Notice 11', key: 'm11' } }]));
    expect(pushed(fixture).filter((push) => push.type === 'ui.toast')).toHaveLength(20);
    expect(pushed(fixture).filter((push) => push.type === 'ui.notify')).toHaveLength(10);
    const items = await tray(fixture, workspaceA);
    expect(items).toHaveLength(11);
    expect(foldedOf(items)).toMatchObject({ source: 'ext:@acme/herald', folded: 2 });
    expect(uiRows(fixture).filter((row) => row['state'] !== 'done')).toEqual([]);
    expect(uiRows(fixture).filter((row) => row['type'] === 'ui.toast')).toHaveLength(21);
    expect(uiRows(fixture).filter((row) => row['type'] === 'ui.notify')).toHaveLength(11);
  });

  it('M2.12-E23 an excess replacement keeps the 10th title and starts a folded entry', async () => {
    const fixture = await opened();
    for (let index = 1; index <= 10; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Title ${index}`, key: 'p' } }]));
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Title 11', key: 'p' } }]));
    const items = await tray(fixture, workspaceA);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.key === 'p')).toMatchObject({ title: 'Title 10' });
    expect(foldedOf(items)).toMatchObject({ folded: 1 });
  });

  it('M2.12-E24 a notice past the first sends minute is shown and pushed', async () => {
    const fixture = await opened();
    for (let index = 1; index <= 10; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `q${index}` } }]));
    }
    fixture.fixture.timers.advance(30_000);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Eleventh', key: 'q11' } }]));
    expect(foldedOf(await tray(fixture, workspaceA))).toMatchObject({ folded: 1 });
    fixture.fixture.timers.advance(30_001);
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Twelfth', key: 'q12' } }]));
    expect(await tray(fixture, workspaceA)).toMatchObject(expect.arrayContaining([expect.objectContaining({ key: 'q12', title: 'Twelfth' })]));
    expect(pushed(fixture).filter((push) => push.type === 'ui.notify')).toHaveLength(11);
  });

  it('M2.12-E25 reading or dismissing a folded entry starts the next one at 1', async () => {
    const fixture = await opened();
    for (let index = 1; index <= 10; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `s${index}` } }]));
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Excess 1', key: 'x1' } }]));
    const first = foldedOf(await tray(fixture, workspaceA));
    expect(first).toMatchObject({ folded: 1 });
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Excess 2', key: 'x2' } }]));
    expect(foldedOf(await tray(fixture, workspaceA))).toMatchObject({ id: first.id, folded: 2 });
    valueOf(await run(fixture.fixture, 'kernel.notification.read', { id: first.id }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Excess 3', key: 'x3' } }]));
    const second = foldedOf(await tray(fixture, workspaceA));
    expect(second).toMatchObject({ folded: 1 });
    expect(second.id).not.toBe(first.id);
    valueOf(await run(fixture.fixture, 'kernel.notification.dismiss', { id: second.id }));
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Excess 4', key: 'x4' } }]));
    const third = foldedOf(await tray(fixture, workspaceA));
    expect(third).toMatchObject({ folded: 1 });
    expect(third.id).not.toBe(second.id);
    expect(changes(fixture)).toHaveLength(16);
  });

  it('M2.12-E26 other workspaces, senders, dismisses, and navigates are never folded', async () => {
    const fixture = await opened();
    for (let index = 1; index <= 10; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'notify', value: { title: `Notice ${index}`, key: `a${index}` } }]));
    }
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'In B', key: 'b' } }], { workspaceId: workspaceB }));
    valueOf(await emitCrier(fixture, [{ kind: 'notify', value: { title: 'Crier', key: 'c' } }]));
    for (let index = 1; index <= 30; index += 1) {
      valueOf(await emit(fixture, [{ kind: 'dismiss', value: `d${index}` }]));
      valueOf(await emit(fixture, [{ kind: 'navigate', value: `/n${index}` }]));
    }
    expect(await tray(fixture, workspaceA)).toHaveLength(11);
    expect(await tray(fixture, workspaceB)).toMatchObject([expect.objectContaining({ key: 'b', title: 'In B' })]);
    expect((await tray(fixture)).some((item) => item.folded !== undefined)).toBe(false);
    expect(pushed(fixture).filter((push) => push.type === 'ui.notify')).toHaveLength(12);
    expect(pushed(fixture).filter((push) => push.type === 'ui.dismiss')).toHaveLength(30);
    expect(pushed(fixture).filter((push) => push.type === 'ui.navigate')).toHaveLength(0);
  });
});
