import { z } from '@kvman/sdk';

// A recording's input and answer (plan 16 §16.5): a website or a page of the workspace, up to 200 steps, the size and
// device, the narration whose caption lines the steps may wait for, and the output.

const target = z.string().min(1).max(500).describe('A Playwright selector: CSS, text=Save, or role=button[name="Save"]; its first match is used once visible.');
const address = z.string().min(1).max(2000);
const atLine = z.number().int().min(1).max(1000).describe('Start no earlier than this caption line (from 1) of the narration is heard.').exactOptional();

export const stepSchema = z.discriminatedUnion('do', [
  z.strictObject({ do: z.literal('goto'), url: address.describe('An http or https address to open.'), atLine }),
  z.strictObject({ do: z.literal('click'), target, atLine }),
  z.strictObject({ do: z.literal('type'), target, text: z.string().min(1).max(2000).describe('The text typed, at a natural pace.'), atLine }),
  z.strictObject({ do: z.literal('press'), key: z.string().min(1).max(100).describe('A key or combination, as Enter or Control+A.'), atLine }),
  z.strictObject({ do: z.literal('hover'), target, atLine }),
  z.strictObject({ do: z.literal('scroll'), pixels: z.number().int().min(-20_000).max(20_000).describe('Pixels to scroll down; negative scrolls up.'), atLine }),
  z.strictObject({ do: z.literal('wait'), ms: z.number().int().min(0).max(60_000).describe('How long the picture holds.') }),
  z.strictObject({ do: z.literal('waitFor'), target, atLine }),
]);

/** One step of a recording. */
export type Step = z.output<typeof stepSchema>;

const side = z.number().int().min(320).max(1920).refine((pixels) => pixels % 2 === 0, 'A side is an even number of pixels.');

const recordFields = z.strictObject({
  url: address.describe('A website to record: any http or https address.').exactOptional(),
  page: z.string().min(1).max(1000).describe('An .html file of the workspace to record, with the files beside it.').exactOptional(),
  steps: z.array(stepSchema).max(200).describe('What happens on the page, in order.').exactOptional(),
  file: z.string().min(1).max(1000).describe('The .mp4 file to write, in the workspace.'),
  width: side.describe('The page width in CSS pixels: 1280 by default, 390 on a phone. The file is twice as wide.').exactOptional(),
  height: side.describe('The page height in CSS pixels: 720 by default, 844 on a phone. The file is twice as high.').exactOptional(),
  device: z.enum(['desktop', 'phone']).describe('desktop (the default), or phone: a touch screen with taps.').exactOptional(),
  narration: z.string().min(1).max(1000).describe("The scene's narration (.mp3, .wav, .m4a), as narrate or voice made it; steps may wait for its lines with atLine.").exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const recordInputSchema = recordFields.superRefine((input, context) => {
  if ((input.url === undefined) === (input.page === undefined)) context.addIssue({ code: 'custom', path: ['url'], message: 'Give exactly one of url and page.' });
  const steps = input.steps ?? [];
  if (input.page !== undefined && steps.some((step) => step.do === 'goto')) context.addIssue({ code: 'custom', path: ['steps'], message: 'A page has no goto steps.' });
  if (input.narration === undefined && steps.some((step) => step.do !== 'wait' && step.atLine !== undefined)) context.addIssue({ code: 'custom', path: ['narration'], message: 'atLine needs a narration.' });
});

/** A recording's input. */
export type RecordInput = z.output<typeof recordInputSchema>;

const boxSchema = z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().nonnegative(), height: z.number().int().nonnegative() });

/** A target's box, in CSS pixels of the viewport. */
export type Box = z.output<typeof boxSchema>;

export const actionSchema = z.object({
  do: z.string(),
  atMs: z.number().int().nonnegative(),
  actMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative(),
  box: boxSchema.optional(),
});

/** What a step did, and when, from the recording's start. */
export type Action = z.output<typeof actionSchema>;

export const recordOutputSchema = z.object({ file: z.string(), durationMs: z.number().int().nonnegative(), steps: z.array(actionSchema) });
