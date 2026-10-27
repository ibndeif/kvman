import { z } from '@kvman/sdk';

// `compose`'s input and answer (plan 16 §16.7).

const workspaceFile = z.string().min(1).max(1000);
const side = z.number().int().min(320).max(1920).refine((pixels) => pixels % 2 === 0, 'A side is an even number of pixels.');

const captionSchema = z
  .strictObject({
    text: z.string().min(1).max(200),
    startMs: z.number().int().nonnegative().describe('From the scene start.'),
    endMs: z.number().int().positive(),
  })
  .refine((caption) => caption.endMs > caption.startMs, 'A caption ends after it starts.');

export const sceneSchema = z
  .strictObject({
    clip: workspaceFile.describe('A video (.webm, .mp4, .mov, .mkv) or an image (.png, .jpg, .jpeg, .webp) in the workspace.'),
    from: z.number().int().nonnegative().describe("Where the video's part starts, in ms.").exactOptional(),
    to: z.number().int().positive().describe("Where the video's part ends, in ms.").exactOptional(),
    narration: workspaceFile.describe('An audio file (.mp3, .wav, .m4a) in the workspace, as narrate wrote it.').exactOptional(),
    captions: z.array(captionSchema).max(200).describe("The narration's captions, as narrate answered them.").exactOptional(),
    durationMs: z.number().int().min(100).max(600_000).describe("The scene's length; else its narration's, else its video part's.").exactOptional(),
  })
  .refine((scene) => scene.from === undefined || scene.to === undefined || scene.to > scene.from, 'A part ends after it starts.');

/** One scene of a composition. */
export type Scene = z.output<typeof sceneSchema>;

export const composeInputSchema = z.strictObject({
  file: workspaceFile.describe('The .mp4 file to write, in the workspace.'),
  scenes: z.array(sceneSchema).min(1).max(100),
  width: side.describe('The width in pixels, 1280 by default.').exactOptional(),
  height: side.describe('The height in pixels, 720 by default.').exactOptional(),
  captions: z
    .strictObject({
      font: z.string().min(1).max(1000).describe('A bundled font (video fonts) or a .ttf or .otf file in the workspace.').exactOptional(),
      size: z.number().int().min(12).max(200).describe('The text size in pixels; the height ÷ 18 by default.').exactOptional(),
      position: z.enum(['bottom', 'top']).exactOptional(),
    })
    .exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const composeOutputSchema = z.object({ file: z.string(), durationMs: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), fileId: z.string().nullable() });
