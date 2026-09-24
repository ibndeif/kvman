import { z } from 'zod';
import { publicNameSchema } from '../extension/grammar.ts';
import { epochMsSchema, typeNameSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { problemSchema } from '../problem.ts';
import { textSchema } from '../text.ts';
import { levelSchema } from './base-types.ts';

export const noticeActionSchema = z.union([
  z.strictObject({ label: textSchema, navigate: z.string().startsWith('/') }),
  z.strictObject({ label: textSchema, command: typeNameSchema, payload: jsonSchema.optional() }),
]);
export type NoticeAction = z.infer<typeof noticeActionSchema>;

export const toastSchema = z.strictObject({
  text: textSchema, level: levelSchema.optional(), key: z.string().min(1).optional(), action: noticeActionSchema.optional(),
  durationMs: z.number().int().positive().optional(),
});
export type Toast = z.infer<typeof toastSchema>;

export const notificationSchema = z.strictObject({
  title: textSchema,
  body: textSchema.optional(),
  level: levelSchema.optional(),
  key: z.string().min(1).optional(),
  problem: problemSchema.optional(),
  route: z.string().startsWith('/').optional(),
  entity: z.strictObject({ type: publicNameSchema, id: z.string().min(1) }).optional(),
  actions: z.array(noticeActionSchema).max(2).optional(),
  attention: z.boolean().optional(),
  expiresAt: epochMsSchema.optional(),
  global: z.boolean().optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const dismissSchema = z.strictObject({ key: z.string().min(1) });

export const navigateSchema = z.strictObject({ route: z.string().startsWith('/') });
