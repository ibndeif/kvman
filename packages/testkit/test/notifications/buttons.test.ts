import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import { emit, emitGlobal, notificationTests, openNotificationFixture, tray, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

function buttonTo(command: string): [{ kind: 'notify'; value: { title: string; actions: Array<{ label: string; command: string }> } }] {
  return [{ kind: 'notify', value: { title: '$t.notify.done', actions: [{ label: 'Run', command }] } }];
}

describe('notification buttons (ADR 0162)', notificationTests, () => {
  it('M2.12-E7 buttons to internal, extensions-only, uncovered, admin, query, grant, and unknown types fail', async () => {
    const fixture = await opened();
    for (const type of [
      'herald.tick', 'herald.api', 'crier.approve', 'desk.read',
      'kernel.extension.disable', 'kernel.health.get', 'kernel.preset.apply', 'herald.nothing',
    ]) {
      const problem = problemOf(await emit(fixture, buttonTo(type)));
      expect(problem.code).toBe('CAPABILITY_DENIED');
      expect(problem.detail).toContain(type);
    }
    expect(await tray(fixture, workspaceA)).toEqual([]);
  });

  it('M2.12-E8 buttons to own all and user types, a covered all type, and a navigate are stored as sent', async () => {
    const fixture = await opened();
    const own = [
      { label: 'Redo', command: 'herald.redo' },
      { label: 'Answer', command: 'herald.answer' },
    ];
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Own', actions: own } }]));
    const foreign = [
      { label: 'Shout', command: 'crier.shout' },
      { label: 'Open', navigate: '/anywhere' },
    ];
    valueOf(await emit(fixture, [{ kind: 'notify', value: { title: 'Foreign', actions: foreign } }]));
    expect(await tray(fixture, workspaceA)).toMatchObject([
      { title: 'Foreign', actions: foreign },
      { title: 'Own', actions: own },
    ]);
  });

  it('M2.12-E9 a global notice keeps an own button but cannot resolve a foreign one', async () => {
    const fixture = await opened();
    valueOf(await emitGlobal(fixture, buttonTo('herald.redo')));
    const problem = problemOf(await emitGlobal(fixture, buttonTo('crier.shout')));
    expect(problem.code).toBe('CAPABILITY_DENIED');
    expect(problem.detail).toContain('crier.shout');
    const items = await tray(fixture);
    expect(items).toHaveLength(1);
    expect(items.at(0)).toMatchObject({
      source: 'ext:@acme/herald', title: '$t.notify.done', actions: [{ label: 'Run', command: 'herald.redo' }],
    });
    expect(items.at(0)).not.toHaveProperty('workspaceId');
  });
});
