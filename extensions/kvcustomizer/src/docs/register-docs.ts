import { z, type Ctx } from '@kvman/sdk';
import { getGuide, guideListSchema, guideSchema, listGuides } from './guides.ts';
import { registerOwnDocs } from './own-docs.ts';

// What the `docs` connector calls (plan 09 §9.1), and kvcustomizer's own docs pair.

export function registerDocs(ctx: Ctx): void {
  ctx.registerQuery('kvcustomizer.guides.list', {
    description: 'Lists the guides of kvman and the documentation pages of every installed extension that serves docs.',
    public: true,
    input: z.object({}),
    output: guideListSchema,
    handle: () => listGuides(ctx),
  });
  ctx.registerQuery('kvcustomizer.guides.get', {
    description: "Gives one guide of kvman, or one page of an installed extension's docs, as Markdown.",
    public: true,
    input: z.object({
      extension: z.string().min(1).optional().describe('The extension package name, such as @kvman/kvwebui; leave it out (or kvman) for a built-in guide.'),
      topic: z.string().describe('The page topic, such as sdk or views.'),
    }),
    output: guideSchema,
    handle: (input) => getGuide(ctx, input),
  });
  registerOwnDocs(ctx);
}
