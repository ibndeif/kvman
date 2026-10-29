import { z } from '@kvman/sdk';

/**
 * A rule file a chat keeps for its life (ADR 0108, 6): its path in the workspace folder, its text as the prompt holds
 * it, and the SHA-256 of the text the chat was last told it changed to, `null` before any change.
 */
export const keptRuleSchema = z.object({ path: z.string(), content: z.string(), told: z.string().nullable() });

export type KeptRule = z.output<typeof keptRuleSchema>;
