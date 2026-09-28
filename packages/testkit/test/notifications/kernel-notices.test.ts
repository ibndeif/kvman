import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { betterSqlite3Driver, createUlidGenerator, openKernelDatabase } from '@kvman/kernel';
import { notificationsListResultSchema, type NotificationItem } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { command, extensionActor, openInstallFixture, person, sendAs, type InstallFixture } from '../install/harness.ts';
import { rows, valueOf } from '../workspaces/harness.ts';
import { deadAfterBackoff, failId, stateOf } from './dead-letters.ts';
import { notificationTests, openNotificationFixture, tab, tray, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;
let reopened: InstallFixture | undefined;

afterEach(async () => {
  await current?.close();
  await reopened?.close();
  current = undefined;
  reopened = undefined;
});

async function opened(): Promise<NotificationFixture> {
  current = await openNotificationFixture();
  return current;
}

const kernelEntries = (items: NotificationItem[]): NotificationItem[] => items.filter((item) => item.source === 'kernel');

function deadEntry(messageId: string, type: string): Partial<NotificationItem> {
  return {
    source: 'kernel', key: `dead:${messageId}`, level: 'error', title: { $t: 'notifications.messageDead', type },
    actions: [{ label: '$t.notifications.actions.retry', command: 'kernel.message.retry', payload: { messageId } }],
  };
}

function secretsFolderBlocked(fixture: InstallFixture): void {
  mkdirSync(join(fixture.home, 'secrets.json.tmp'));
}

describe("the kernel's own notifications (ADR 0164)", notificationTests, () => {
  it('M2.12-H4 a dead-lettered action of a person notifies with the problem and a Retry', async () => {
    const fixture = await opened();
    valueOf(await command(fixture.fixture, 'herald.fail-later', {}, tab, workspaceA));
    await eventually(() => expect(rows(fixture.fixture, "SELECT id FROM messages WHERE type = 'herald.fail'")).toHaveLength(1));
    const messageId = failId(fixture.fixture);
    await deadAfterBackoff(fixture.fixture, messageId);
    await eventually(async () => expect(kernelEntries(await tray(fixture, workspaceA))).toHaveLength(1));
    const [entry] = kernelEntries(await tray(fixture, workspaceA));
    expect(entry).toMatchObject({ ...deadEntry(messageId, 'herald.fail'), workspaceId: workspaceA, problem: { code: 'MESSAGE_DEAD' } });
  });

  it('M2.12-H5 a failed secrets-file write notifies with the extension and secret name, never the value', async () => {
    const fixture = await opened();
    valueOf(await command(fixture.fixture, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'value-one-0123456' }));
    secretsFolderBlocked(fixture.fixture);
    expect(await command(fixture.fixture, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'value-two-0123456' })).toEqual({ ok: true, value: {} });
    await eventually(async () => expect(kernelEntries(await tray(fixture))).toHaveLength(1));
    const [entry] = kernelEntries(await tray(fixture));
    expect(entry).toMatchObject({ source: 'kernel', key: 'secrets:@acme/desk:apiKey', level: 'error', title: { $t: 'notifications.secretsWriteFailed', extension: '@acme/desk', secret: 'apiKey' } });
    expect(entry).not.toHaveProperty('workspaceId');
    const stored = JSON.stringify([rows(fixture.fixture, 'SELECT data FROM notifications'), rows(fixture.fixture, "SELECT payload FROM messages WHERE type LIKE 'ui.%'")]);
    for (const value of ['value-one-0123456', 'value-two-0123456']) expect(stored).not.toContain(value);
  });

  it("M2.12-E41 only a person's correlation notifies; a global dead message notifies globally", async () => {
    const fixture = await opened();
    await sendAs(fixture.fixture, extensionActor('@acme/herald'), 'herald.fail', {}, workspaceA);
    const byExtension = failId(fixture.fixture);
    await deadAfterBackoff(fixture.fixture, byExtension);
    await sendAs(fixture.fixture, person, 'herald.fail-global', {});
    const global = failId(fixture.fixture);
    await deadAfterBackoff(fixture.fixture, global);
    await eventually(async () => expect(kernelEntries(await tray(fixture))).toHaveLength(1));
    const [entry] = kernelEntries(await tray(fixture));
    expect(entry).toMatchObject(deadEntry(global, 'herald.fail-global'));
    expect(entry).not.toHaveProperty('workspaceId');
  });

  it('M2.12-E42 boot recovery that makes an interrupted message dead notifies', async () => {
    const fixture = await opened();
    await sendAs(fixture.fixture, person, 'herald.fail', {}, workspaceA);
    const messageId = failId(fixture.fixture);
    await eventually(() => expect(stateOf(fixture.fixture, messageId)).toEqual({ state: 'pending', attempts: 1 }));
    const { home } = fixture.fixture;
    await fixture.close();
    current = undefined;
    const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, createUlidGenerator(Date.now).next());
    connection.prepare("UPDATE messages SET state = 'running', attempts = 1 WHERE id = ?").run(messageId);
    connection.close();
    reopened = await openInstallFixture({ home });
    expect(stateOf(reopened, messageId).state).toBe('dead');
    const answer = await reopened.runtime.query({ sender: person, type: 'kernel.notifications.list', payload: { workspaceId: workspaceA }, cause: undefined, workspaceId: undefined });
    if (!answer.ok) throw new Error(answer.problem.code);
    expect(kernelEntries(notificationsListResultSchema.parse(answer.value).items)).toMatchObject([{ ...deadEntry(messageId, 'herald.fail'), workspaceId: workspaceA }]);
  });

  it('M2.12-E43 clearing an uninstalled extension\'s secrets that fails to write notifies with the extension only', async () => {
    const fixture = await opened();
    valueOf(await command(fixture.fixture, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'value-one-0123456' }));
    secretsFolderBlocked(fixture.fixture);
    valueOf(await command(fixture.fixture, 'kernel.extension.uninstall', { name: '@acme/desk', deleteData: true }));
    await eventually(async () => expect(kernelEntries(await tray(fixture))).toHaveLength(1));
    const [entry] = kernelEntries(await tray(fixture));
    expect(entry).toMatchObject({ key: 'secrets:@acme/desk', title: { $t: 'notifications.secretsWriteFailed', extension: '@acme/desk' } });
    expect(entry?.title).not.toHaveProperty('secret');
  });

  it('M2.12-E44 twelve dead letters of a person in a minute are all shown', async () => {
    const fixture = await opened();
    const ids: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      await sendAs(fixture.fixture, person, 'herald.fail', {}, workspaceA);
      ids.push(failId(fixture.fixture));
    }
    for (const messageId of ids) await eventually(() => expect(stateOf(fixture.fixture, messageId)).toEqual({ state: 'pending', attempts: 1 }));
    fixture.fixture.timers.advance(1_000);
    for (const messageId of ids) await eventually(() => expect(stateOf(fixture.fixture, messageId).state).toBe('dead'));
    await eventually(async () => expect(kernelEntries(await tray(fixture, workspaceA))).toHaveLength(12));
    expect((await tray(fixture, workspaceA)).some((item) => item.folded !== undefined)).toBe(false);
  });
});
