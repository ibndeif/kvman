import { z, type Ctx } from '@kvman/sdk';
import { bundledFonts } from './bundled-fonts.ts';

export function registerFonts(ctx: Ctx): void {
  ctx.registerQuery('kvvideo.font.list', {
    description: 'Lists the fonts bundled for captions, with the scripts each one writes.',
    input: z.object({}),
    output: z.array(z.object({ name: z.string(), scripts: z.array(z.enum(['latin', 'arabic'])) })),
    public: true,
    handle: () => bundledFonts.map(({ name, scripts }) => ({ name, scripts })),
  });
}
