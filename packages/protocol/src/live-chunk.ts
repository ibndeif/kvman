import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { limits } from './limits.ts';
import { textSchema } from './text.ts';
import { jsonByteLength } from './unicode.ts';

export const liveChunkSchema = z
  .union([
    z.strictObject({ text: z.string() }),
    z.strictObject({ value: z.number().min(0).max(1), label: textSchema.optional() }),
    z.strictObject({ data: jsonSchema }),
    z.strictObject({ reset: z.literal(true) }),
  ])
  .refine((chunk) => jsonByteLength(chunk) <= limits.liveChunkBytes, `a live chunk is at most ${limits.liveChunkBytes} bytes`);

export type LiveChunk = z.infer<typeof liveChunkSchema>;
