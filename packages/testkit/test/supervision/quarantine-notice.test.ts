import { notificationsListResultSchema, type NotificationItem } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, rows, send, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
afterEach(() => fixture.close());

async function kernelEntries(): Promise<NotificationItem[]> {
  const answer = await fixture.runtime.query({ sender: { address: 'user:local' }, type: 'kernel.notifications.list', payload: {}, cause: undefined, workspaceId: undefined });
  if (!answer.ok) throw new Error(answer.problem.code);
  return notificationsListResultSchema.parse(answer.value).items.filter((item) => item.source === 'kernel');
}

describe('the quarantine notification (ADR 0164)', workerTests, () => {
  it('M2.12-E39 a quarantine notifies the person globally with a way to the recovery page', async () => {
    fixture = await openHostFixture();
    for (let crash = 0; crash < 3; crash += 1) await pendingWithAttempts(fixture, await send(fixture, 'counter.crash'), 1);
    await eventually(() => expect(rows(fixture, "SELECT status FROM extensions WHERE name = '@acme/counter'")).toEqual([{ status: 'quarantined' }]));
    const entries = await kernelEntries();
    expect(entries).toMatchObject([{
      key: 'quarantine:@acme/counter', level: 'error', title: { $t: 'notifications.quarantined', extension: '@acme/counter', reason: 'HOST_FAILURES' },
      actions: [{ label: '$t.notifications.actions.recovery', navigate: '/_kvman' }],
    }]);
    expect(entries.at(0)).not.toHaveProperty('workspaceId');
  });
});
