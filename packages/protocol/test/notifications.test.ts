import { describe, expect, it } from 'vitest';
import {
  messageRetryRequestSchema, notificationItemSchema, notificationsCountRequestSchema, notificationsListRequestSchema, notificationsMuteRequestSchema,
  notificationsReadAllRequestSchema, sseMessageSchemas,
} from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const id = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const workspaceId = 'a'.repeat(64);
const entry = { id, source: 'ext:@acme/herald', level: 'info', attention: false, read: false, muted: false, createdAt: 1, updatedAt: 2 } as const;

describe('notification tray shapes (ADRs 0162, 0163)', () => {
  it('M2.12-E51 stream ui messages, tray items, tray requests, and the retry request', () => {
    expectRoundTrip(sseMessageSchemas.ui, { workspaceId, type: 'ui.notify', source: 'ext:@acme/herald', payload: { title: '$t.notify.done' } });
    expectRoundTrip(sseMessageSchemas.ui, { clientId: 'c1', type: 'ui.toast', source: 'ext:@acme/herald', payload: { text: 'Saved' } });
    expect(issuePaths(sseMessageSchemas.ui, { workspaceId: 'nope', type: 'ui.dismiss', source: 'kernel', payload: { key: 'k' } })).not.toEqual([]);

    expectRoundTrip(notificationItemSchema, { ...entry, workspaceId, key: 'k', title: '$t.notify.done', route: '/items/1', actions: [{ label: 'Open', navigate: '/items/1' }] });
    expectRoundTrip(notificationItemSchema, { ...entry, folded: 3 });
    expect(notificationItemSchema.safeParse({ ...entry }).success).toBe(false);
    expect(notificationItemSchema.safeParse({ ...entry, title: 'x', folded: 2 }).success).toBe(false);

    expectRoundTrip(notificationsListRequestSchema, { workspaceId, unreadOnly: true });
    expectRoundTrip(notificationsCountRequestSchema, {});
    expectRoundTrip(notificationsReadAllRequestSchema, { workspaceId });
    expectRoundTrip(notificationsMuteRequestSchema, { workspaceId, extension: '@acme/herald', muted: true });
    for (const [schema, value] of [
      [notificationsListRequestSchema, { unreadOnly: true, page: 2 }],
      [notificationsCountRequestSchema, { workspaceId, extra: 1 }],
      [notificationsReadAllRequestSchema, { all: true }],
      [notificationsMuteRequestSchema, { workspaceId, extension: '@acme/herald', muted: true, forever: true }],
    ] as const) expect(schema.safeParse(value).success).toBe(false);

    expectRoundTrip(messageRetryRequestSchema, { messageId: id });
    expect(issuePaths(messageRetryRequestSchema, {})).toEqual(['messageId']);
  });
});
