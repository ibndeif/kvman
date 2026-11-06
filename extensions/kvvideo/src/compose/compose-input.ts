import { z } from '@kvman/sdk';

// `compose`'s input and answer (plan 16 §16.8; ADR 0115, 7, 10, 11, and 18).

const workspaceFile = z.string().min(1).max(1000);
const side = z.number().int().min(320).max(1920).refine((pixels) => pixels % 2 === 0, 'A side is an even number of pixels.');
const ms = z.number().int().nonnegative();

const wordSchema = z.strictObject({ text: z.string().min(1).max(200), startMs: ms, endMs: ms });

const captionSchema = z
  .strictObject({
    text: z.string().min(1).max(200),
    startMs: ms.describe('From the scene start.'),
    endMs: z.number().int().positive(),
    words: z.array(wordSchema).max(40).describe('Each word with its times, as narrate answers them with ElevenLabs.').exactOptional(),
  })
  .refine((caption) => caption.endMs > caption.startMs, 'A caption ends after it starts.');

const boxSchema = z.strictObject({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive() });

export const overlaySchema = z
  .strictObject({
    kind: z.enum(['callout', 'highlight', 'blur']).describe('callout: a label pointing at the place; highlight: dim all but it; blur: hide it.'),
    step: z.number().int().min(1).describe("A step of the clip's recording, from 1, whose target it marks.").exactOptional(),
    box: boxSchema.describe('A place on the recorded page, in its CSS pixels.').exactOptional(),
    text: z.string().min(1).max(80).describe("A callout's label.").exactOptional(),
    fromMs: ms.describe('From the scene start.'),
    toMs: z.number().int().positive(),
  })
  .superRefine((overlay, context) => {
    if ((overlay.step === undefined) === (overlay.box === undefined)) context.addIssue({ code: 'custom', path: ['step'], message: 'Give exactly one of step and box.' });
    if (overlay.kind === 'callout' && overlay.text === undefined) context.addIssue({ code: 'custom', path: ['text'], message: 'A callout has text.' });
    if (overlay.toMs <= overlay.fromMs) context.addIssue({ code: 'custom', path: ['toMs'], message: 'An overlay ends after it starts.' });
  });

/** A mark on a recorded page. */
export type Overlay = z.output<typeof overlaySchema>;

export const sceneSchema = z
  .strictObject({
    clip: workspaceFile.describe('A video (.webm, .mp4, .mov, .mkv) or an image (.png, .jpg, .jpeg, .webp) in the workspace.'),
    from: ms.describe("Where the video's part starts, in ms.").exactOptional(),
    to: z.number().int().positive().describe("Where the video's part ends, in ms.").exactOptional(),
    narration: workspaceFile.describe('An audio file (.mp3, .wav, .m4a) in the workspace, as narrate or voice wrote it.').exactOptional(),
    captions: z.array(captionSchema).max(200).describe("The narration's captions; left out, the narration's own.").exactOptional(),
    durationMs: z.number().int().min(100).max(600_000).describe("The scene's length; else its narration's, else its video part's.").exactOptional(),
    frame: z.enum(['window', 'phone', 'none']).describe('How the clip is shown: window by default for a recorded website, phone for one on a phone, else none.').exactOptional(),
    background: z.string().min(1).max(1000).describe("#RRGGBB or an image file of the workspace behind the clip; left out, the brand's.").exactOptional(),
    camera: z.enum(['auto', 'none']).describe('auto by default for a recorded website (zooms to clicks and typing) and an image (a slow zoom).').exactOptional(),
    overlays: z.array(overlaySchema).max(20).describe('Callouts, highlights, and blurs on a recorded page.').exactOptional(),
    transition: z
      .strictObject({
        kind: z.enum(['cut', 'crossfade', 'fade-black', 'slide']).describe('crossfade by default.'),
        toward: z.enum(['start', 'end', 'up', 'down']).describe("A slide's way: start (the default) is left in an ltr video, right in an rtl one.").exactOptional(),
        ms: z.number().int().min(0).max(2000).describe('Its length: 500 by default, 0 for a cut; at most half of each scene.').exactOptional(),
      })
      .describe('Into the next scene.')
      .exactOptional(),
    sounds: z.boolean().describe("false turns the scene's sound effects off.").exactOptional(),
  })
  .refine((scene) => scene.from === undefined || scene.to === undefined || scene.to > scene.from, 'A part ends after it starts.');

/** One scene of a composition. */
export type Scene = z.output<typeof sceneSchema>;

export const captionStyles = ['boxed', 'outline', 'highlight', 'off'] as const;

/** How captions look. */
export type CaptionStyleName = (typeof captionStyles)[number];

export const composeInputSchema = z.strictObject({
  file: workspaceFile.describe('The .mp4 file to write, in the workspace.'),
  scenes: z.array(sceneSchema).min(1).max(100),
  width: side.describe('The width in pixels, 1920 by default.').exactOptional(),
  height: side.describe('The height in pixels, 1080 by default.').exactOptional(),
  extraSizes: z.array(z.strictObject({ width: side, height: side })).max(2).describe('Up to 2 more sizes of the same video, as 1080 x 1920 or 1080 x 1080.').exactOptional(),
  direction: z.enum(['ltr', 'rtl']).describe('The reading direction for slides; rtl by default when a caption has an Arabic letter.').exactOptional(),
  sounds: z.boolean().describe('false turns all sound effects off.').exactOptional(),
  captions: z
    .strictObject({
      style: z.enum(captionStyles).describe("boxed (in the brand's colour; the default with a brand), outline (the default with none), highlight (word by word where words are timed), or off.").exactOptional(),
      font: z.string().min(1).max(1000).describe("A bundled font (video fonts) or a .ttf or .otf file in the workspace; left out, the brand's.").exactOptional(),
      size: z.number().int().min(12).max(200).describe('The text size in pixels; the height ÷ 18 by default.').exactOptional(),
      position: z.enum(['bottom', 'top']).exactOptional(),
    })
    .exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const composeOutputSchema = z.object({ file: z.string(), durationMs: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), fileId: z.string().nullable(), poster: z.string(), posterFileId: z.string().nullable(), others: z.array(z.object({ file: z.string(), bytes: z.number().int().nonnegative() })) });
