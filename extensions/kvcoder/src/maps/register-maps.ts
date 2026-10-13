import { z, type Ctx } from '@kvman/sdk';
import { chatIdOf } from '../artifacts/artifact-records.ts';
import { findSession } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { mapNoteSchema, mapStepSchema } from './map-schema.ts';

// The person's view of a chat's execution map (plan 08 §8.6, ADR 0064, 8). Only the agent changes it, and a subagent's
// session answers with the map of the chat at its root.

export function registerMaps(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.map.get', {
    description: "Gives a chat's execution map, or null when it has none.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({ goal: z.string(), steps: z.array(mapStepSchema), notes: z.array(mapNoteSchema), version: z.number().int(), updatedAt: z.string() }).nullable(),
    public: true,
    handle: async ({ sessionId }) => {
      const chatId = chatIdOf(await findSession(ctx, sessionId));
      const [found] = await records(ctx.store).maps.find({ sessionId: chatId }, { limit: 1 });
      return found === undefined ? null : { goal: found.goal, steps: found.steps, notes: found.notes, version: found.version, updatedAt: found.updatedAt };
    },
  });
}
