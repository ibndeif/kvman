import { z, type Ctx } from '@kvman/sdk';
import { captionFont } from '../compose/caption-font.ts';
import { inputPath } from '../files/workspace-paths.ts';

// The workspace's brand (plan 16 §16.2 and §16.4; ADR 0115, 21 and 43): its logo, colours, and font, read with
// `video brand` and set with `video brand-set` without asking, since the person agreed to it in the script.

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour is #RRGGBB.');

export const brandSchema = z.strictObject({
  logo: z.string().min(1).max(1000).nullable().describe('A .png, .svg, .jpg, or .webp file in the workspace, or null.'),
  colors: z.strictObject({ primary: colour, background: colour, text: colour }),
  font: z.string().min(1).max(1000).nullable().describe('A bundled font (video fonts), a .ttf or .otf file in the workspace, or null.'),
});

/** A workspace's brand. */
export type Brand = z.output<typeof brandSchema>;

export const logoExtensions = ['.png', '.svg', '.jpg', '.jpeg', '.webp'];

/** Checks a brand's files and font in the workspace `root`. */
export function checkBrand(root: string, brand: Brand): void {
  if (brand.logo !== null) inputPath(root, brand.logo, logoExtensions);
  if (brand.font !== null) captionFont(root, brand.font, []);
}

export function registerBrand(ctx: Ctx): void {
  ctx.registerSetting('kvvideo.brand', { description: "The workspace's brand for its videos: a logo file, the primary, background, and text colours, and a font; null for none.", schema: brandSchema.nullable(), default: null });
  ctx.registerQuery('kvvideo.brand.get', {
    description: "Gives the workspace's brand for videos: its logo, colours, and font, or null.",
    input: z.strictObject({}),
    output: brandSchema.nullable(),
    public: true,
    timeoutMs: 60_000,
    handle: async () => ctx.settings.get('kvvideo.brand'),
  });
  ctx.registerCommand('kvvideo.brand.set', {
    description: "Sets the workspace's brand for videos: its logo, colours, and font.",
    input: brandSchema,
    output: z.strictObject({}),
    public: true,
    retries: 0,
    timeoutMs: 60_000,
    handle: async (input) => {
      checkBrand(ctx.job.workspace.path, input);
      await ctx.settings.set('kvvideo.brand', input, { scope: 'workspace' });
      return {};
    },
  });
}
