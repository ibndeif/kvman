import { z } from '@kvman/sdk';

/**
 * What a reply's model call was sent (ADR 0108, 8): the SHA-256 of the system prompt with the tools, the SHA-256 of
 * the messages, their count, and whether they start with the previous call's messages unchanged. Nothing of the text.
 */
export const sentRecordSchema = z.object({ promptHash: z.string(), messagesHash: z.string(), messageCount: z.number().int().nonnegative(), prefixKept: z.boolean() });

export type SentRecord = z.output<typeof sentRecordSchema>;
