import { z } from '@kvman/sdk';

/** A sign-in to an MCP server that was started and not yet finished (plan 08 §8.5): kept in the global store, by its state. */
export const signInDocSchema = z.object({ state: z.string(), server: z.string(), url: z.string(), redirectUrl: z.string(), at: z.number() });
