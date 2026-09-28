import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { problemOf } from '../install/harness.ts';
import { valueOf } from '../workspaces/harness.ts';
import { emit, emitGlobal, issuePaths, notificationTests, openNotificationFixture, tray, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

type EntitySends = Array<{ kind: 'notify'; value: { title: string; entity: { type: string; id: string }; route?: string } }>;

function entityNotice(type: string, id: string): EntitySends {
  return [{ kind: 'notify', value: { title: '$t.notify.done', entity: { type, id } } }];
}

describe('notification entities (ADR 0162)', notificationTests, () => {
  it('M2.12-E10 entities render their routes with the id encoded', async () => {
    const fixture = await opened();
    valueOf(await emit(fixture, entityNotice('herald.item', 'a b/c')));
    valueOf(await emit(fixture, entityNotice('crier.thing', 't1')));
    expect(await tray(fixture, workspaceA)).toMatchObject([
      { entity: { type: 'crier.thing', id: 't1' }, route: '/things/t1' },
      { entity: { type: 'herald.item', id: 'a b/c' }, route: '/items/a%20b%2Fc' },
    ]);
  });

  it('M2.12-E11 entities without a route, needing another field, unknown, or paired with a route fail', async () => {
    const fixture = await opened();
    const cases: Array<{ sends: EntitySends; path: string }> = [
      { sends: entityNotice('herald.plain', 'p1'), path: 'entity.type' },
      { sends: entityNotice('herald.pair', 'p1'), path: 'entity.type' },
      { sends: entityNotice('nobody.thing', 't1'), path: 'entity.type' },
      { sends: [{ kind: 'notify', value: { title: '$t.notify.done', entity: { type: 'herald.item', id: 'a' }, route: '/x' } }], path: 'route' },
    ];
    for (const { sends, path } of cases) {
      const problem = problemOf(await emit(fixture, sends));
      expect(problem.code).toBe('VALIDATION_FAILED');
      expect(issuePaths(problem)).toEqual(expect.arrayContaining([expect.stringContaining(path)]));
    }
    expect(await tray(fixture, workspaceA)).toEqual([]);
  });

  it('M2.12-E12 a global notice resolves only the sender own entities', async () => {
    const fixture = await opened();
    const refused = problemOf(await emitGlobal(fixture, entityNotice('crier.thing', 't1')));
    expect(refused.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(refused)).toEqual(expect.arrayContaining([expect.stringContaining('entity.type')]));
    valueOf(await emitGlobal(fixture, entityNotice('herald.item', 'a')));
    const items = await tray(fixture);
    expect(items).toHaveLength(1);
    expect(items.at(0)).toMatchObject({ entity: { type: 'herald.item', id: 'a' }, route: '/items/a' });
    expect(items.at(0)).not.toHaveProperty('workspaceId');
  });
});
