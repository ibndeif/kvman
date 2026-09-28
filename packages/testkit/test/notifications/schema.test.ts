import { schemaDocumentSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { person } from '../install/harness.ts';
import { query } from '../workspaces/harness.ts';
import { notificationTests, openNotificationFixture, type NotificationFixture } from './harness.ts';

let current: NotificationFixture | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe('the notification schema (ADRs 0162–0164)', notificationTests, () => {
  it('M2.12-E50 kernel.schema.get lists the ui, tray, changed, and retry types', async () => {
    current = await openNotificationFixture();
    const fixture: NotificationFixture = current;
    const answer = await query(fixture.fixture, 'kernel.schema.get', {}, person);
    if (typeof answer !== 'object' || answer === null || !('value' in answer)) {
      throw new Error('kernel.schema.get did not answer');
    }
    const document = schemaDocumentSchema.parse(answer.value);
    for (const type of ['ui.toast', 'ui.notify', 'ui.dismiss', 'ui.navigate']) {
      expect(document.types).toContainEqual(expect.objectContaining({ type, kind: 'command', access: 'extensions' }));
    }
    expect(document.types).toContainEqual(expect.objectContaining({ type: 'kernel.notifications.list', kind: 'query' }));
    expect(document.types).toContainEqual(expect.objectContaining({ type: 'kernel.notifications.count', kind: 'query' }));
    for (const type of ['kernel.notification.read', 'kernel.notification.dismiss', 'kernel.notifications.read-all', 'kernel.notifications.mute']) {
      expect(document.types).toContainEqual(expect.objectContaining({ type, kind: 'command' }));
    }
    expect(document.types).toContainEqual(
      expect.objectContaining({ type: 'kernel.notifications.changed', kind: 'event', delivery: 'transient' }),
    );
    expect(document.types).toContainEqual(expect.objectContaining({ type: 'kernel.message.retry', kind: 'command' }));
  });
});
