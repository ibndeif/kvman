import { z } from 'zod';
import { typeNameSchema } from './identifiers.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { limits } from './limits.ts';
import { problemSchema } from './problem.ts';

// 12 §12.4, ADR 0140: kernel.sock takes one request of at most 17 MB (the 16 MB payload and its envelope) per
// connection; its path must fit the operating system's socket path limit.
export const socketLimits = { requestBytes: 17 * 1024 * 1024, pathBytes: 103 } as const;

const token = z.string().min(1);

export const socketRequestSchema = z.discriminatedUnion('op', [
  z.strictObject({
    token, op: z.literal('command'), type: typeNameSchema, payload: jsonSchema, idempotencyKey: z.string().min(1).exactOptional(),
    wait: z.number().int().min(0).max(limits.maxCommandWaitMs).exactOptional(),
  }),
  z.strictObject({ token, op: z.literal('query'), type: typeNameSchema, payload: jsonSchema }),
  z.strictObject({ token, op: z.literal('help'), type: typeNameSchema.exactOptional() }),
]);
export type SocketRequest = z.infer<typeof socketRequestSchema>;

export const socketAnswerSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: jsonSchema }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
]);
export type SocketAnswer = z.infer<typeof socketAnswerSchema>;

// A command whose reply was deferred, or not ready within `wait` (12 §12.2).
export const socketAcceptedSchema = z.strictObject({ id: z.string().min(1), state: z.string().min(1) });

export const callableKindSchema = z.enum(['command', 'query']);

export const helpEntrySchema = z.strictObject({ type: typeNameSchema, kind: callableKindSchema, description: z.string() });
export type HelpEntry = z.infer<typeof helpEntrySchema>;

export const helpListSchema = z.strictObject({ types: z.array(helpEntrySchema) });
export type HelpList = z.infer<typeof helpListSchema>;

export const helpTypeSchema = z.strictObject({
  ...helpEntrySchema.shape, input: jsonObjectSchema, output: jsonObjectSchema.exactOptional(), markdown: z.string(),
});
export type HelpType = z.infer<typeof helpTypeSchema>;
