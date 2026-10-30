import { z } from '@kvman/sdk';

/**
 * A server a turn keeps for its life (ADR 0108, 12): the MCP session its calls share, and for a command server run
 * with a `port`, the process kvman started and its folder. Deleted when the turn ends.
 */
export const mcpSessionDocSchema = z.object({
  turnId: z.string(),
  server: z.string(),
  mcpSessionId: z.string().nullable(),
  processName: z.string().nullable(),
  folder: z.string().nullable(),
  createdAt: z.string(),
});

export type McpSessionDoc = z.output<typeof mcpSessionDocSchema>;
