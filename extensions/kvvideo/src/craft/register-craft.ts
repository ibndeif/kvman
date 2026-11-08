import { readFile } from 'node:fs/promises';
import { z, type Ctx } from '@kvman/sdk';

/** The craft notes' topics (plan 16 §16.4; ADR 0121, 2). */
export const craftTopics = ['story', 'scenes', 'motion', 'charts', 'tutorial', 'social'] as const;

export const craftInputSchema = z.strictObject({ topic: z.enum(craftTopics) });
export const craftOutputSchema = z.strictObject({ content: z.string() });

type CraftTopic = (typeof craftTopics)[number];

// A craft note's text, from kvvideo's `docs/craft/<topic>.md`, beside `src` and `dist` alike.
async function readCraftNote(topic: CraftTopic): Promise<string> {
  return readFile(new URL(`../../docs/craft/${topic}.md`, import.meta.url), 'utf8');
}

export function registerCraft(ctx: Ctx): void {
  ctx.registerQuery('kvvideo.craft.get', {
    description: 'Gives one craft note for making better videos: story, scenes, motion, charts, tutorial, or social.',
    input: craftInputSchema,
    output: craftOutputSchema,
    public: true,
    timeoutMs: 60_000,
    handle: async ({ topic }) => ({ content: await readCraftNote(topic) }),
  });
}
