import { z } from 'zod';
import { addressSchema } from '../address.ts';
import { packageNameSchema, publicNameSchema } from '../extension/grammar.ts';
import { epochMsSchema, ulidSchema, workspaceIdSchema } from '../identifiers.ts';
import { problemSchema } from '../problem.ts';
import { textSchema } from '../text.ts';
import { levelSchema } from './base-types.ts';
import { noticeActionSchema } from './notifications.ts';

const countSchema = z.number().int().nonnegative();

// A tray entry as kernel.notifications.list answers it (ADR 0163). A folded entry (ADR 0162) has `folded` and no
// title; every other entry has a title and no `folded`.
export const notificationItemSchema = z
  .strictObject({
    id: ulidSchema,
    workspaceId: workspaceIdSchema.exactOptional(),
    source: addressSchema,
    key: z.string().min(1).exactOptional(),
    level: levelSchema,
    title: textSchema.exactOptional(),
    body: textSchema.exactOptional(),
    problem: problemSchema.exactOptional(),
    route: z.string().startsWith('/').exactOptional(),
    entity: z.strictObject({ type: publicNameSchema, id: z.string().min(1) }).exactOptional(),
    actions: z.array(noticeActionSchema).max(2).exactOptional(),
    attention: z.boolean(),
    expiresAt: epochMsSchema.exactOptional(),
    read: z.boolean(),
    muted: z.boolean(),
    folded: z.number().int().positive().exactOptional(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .refine((item) => (item.folded === undefined) !== (item.title === undefined), 'an entry has a title, or is folded and has none');
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationsListRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional(), unreadOnly: z.boolean().exactOptional() });
export type NotificationsListRequest = z.infer<typeof notificationsListRequestSchema>;

export const notificationsListResultSchema = z.strictObject({ items: z.array(notificationItemSchema) });
export type NotificationsListResult = z.infer<typeof notificationsListResultSchema>;

export const notificationsCountRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type NotificationsCountRequest = z.infer<typeof notificationsCountRequestSchema>;

export const notificationsCountResultSchema = z.strictObject({ unread: countSchema, attention: countSchema });
export type NotificationsCountResult = z.infer<typeof notificationsCountResultSchema>;

// kernel.notification.read and kernel.notification.dismiss.
export const notificationRequestSchema = z.strictObject({ id: ulidSchema });
export type NotificationRequest = z.infer<typeof notificationRequestSchema>;

export const notificationsReadAllRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type NotificationsReadAllRequest = z.infer<typeof notificationsReadAllRequestSchema>;

export const notificationsMuteRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, extension: packageNameSchema, muted: z.boolean() });
export type NotificationsMuteRequest = z.infer<typeof notificationsMuteRequestSchema>;

// The answer of every tray command and of kernel.message.retry.
export const emptyResultSchema = z.strictObject({});

// kernel.notifications.changed, published globally; absent `workspaceId` names the global entries (ADR 0163).
export const notificationsChangedSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type NotificationsChanged = z.infer<typeof notificationsChangedSchema>;

// What ui.toast, ui.notify, ui.dismiss, and ui.navigate answer (02 §2.4).
export const uiSendResultSchema = z.strictObject({ ok: z.literal(true) });

export const messageRetryRequestSchema = z.strictObject({ messageId: ulidSchema });
export type MessageRetryRequest = z.infer<typeof messageRetryRequestSchema>;
