import { z } from 'zod';
import { publicNameSchema } from '../extension/grammar.ts';
import { epochMsSchema, typeNameSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { problemSchema } from '../problem.ts';
import { textSchema } from '../text.ts';
import { levelSchema } from './base-types.ts';

export const noticeActionSchema = z.union([
  z.strictObject({ label: textSchema, navigate: z.string().startsWith('/') }),
  z.strictObject({ label: textSchema, command: typeNameSchema, payload: jsonSchema.exactOptional() }),
]);
export type NoticeAction = z.infer<typeof noticeActionSchema>;

export const toastSchema = z.strictObject({
  text: textSchema, level: levelSchema.exactOptional(), key: z.string().min(1).exactOptional(), action: noticeActionSchema.exactOptional(),
  durationMs: z.number().int().positive().exactOptional(),
});
export type Toast = z.infer<typeof toastSchema>;

export const notificationSchema = z.strictObject({
  title: textSchema,
  body: textSchema.exactOptional(),
  level: levelSchema.exactOptional(),
  key: z.string().min(1).exactOptional(),
  problem: problemSchema.exactOptional(),
  route: z.string().startsWith('/').exactOptional(),
  entity: z.strictObject({ type: publicNameSchema, id: z.string().min(1) }).exactOptional(),
  actions: z.array(noticeActionSchema).max(2).exactOptional(),
  attention: z.boolean().exactOptional(),
  expiresAt: epochMsSchema.exactOptional(),
  global: z.boolean().exactOptional(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const dismissSchema = z.strictObject({ key: z.string().min(1) });

export const navigateSchema = z.strictObject({ route: z.string().startsWith('/') });
