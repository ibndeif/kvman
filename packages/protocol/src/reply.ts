import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';

export const replyPayloadSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: jsonSchema }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
]);

export type ReplyPayload = z.infer<typeof replyPayloadSchema>;
