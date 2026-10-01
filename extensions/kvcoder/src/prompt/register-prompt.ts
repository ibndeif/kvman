import { z, type Ctx } from '@kvman/sdk';
import { findSession } from '../sessions/session-lookup.ts';
import { sessionTools } from './session-prompt.ts';

// `kvcoder.prompt.get` (plan 08 §8.6): the exact system prompt a session's next step sends, with each section's owner,
// reach, and size for the conversation's Prompt tab (ADR 0009, 104).
export function registerPrompt(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.prompt.get', {
    description: "Gives the exact system prompt of a session's next step, and its sections.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({
      prompt: z.string(),
      sections: z.array(z.object({ id: z.string(), title: z.string(), owner: z.string(), reach: z.enum(['global', 'workspace', 'session']), size: z.number(), included: z.boolean() })),
    }),
    public: true,
    handle: async ({ sessionId }) => {
      const tools = await sessionTools(ctx, await findSession(ctx, sessionId));
      const sections = [...tools.built.included, ...tools.built.left].map((section) => ({
        id: section.id,
        title: section.title,
        owner: section.owner,
        reach: section.global ? ('global' as const) : section.sessionId === null ? ('workspace' as const) : ('session' as const),
        size: section.size,
        included: tools.built.included.has(section),
      }));
      return { prompt: tools.built.prompt, sections };
    },
  });
}
