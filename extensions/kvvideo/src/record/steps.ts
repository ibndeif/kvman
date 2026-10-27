import { z } from '@kvman/sdk';

// A recording's input (plan 16 §16.5): the page, up to 200 steps, the size, and the output.

const target = z.string().min(1).max(500).describe('A Playwright selector: CSS, text=Save, or role=button[name="Save"]; its first match is used once visible.');
const address = z.string().min(1).max(2000);

export const stepSchema = z.discriminatedUnion('do', [
  z.strictObject({ do: z.literal('goto'), url: address.describe('A localhost address to open.') }),
  z.strictObject({ do: z.literal('click'), target }),
  z.strictObject({ do: z.literal('type'), target, text: z.string().min(1).max(2000).describe('The text typed, one character every 50 ms.') }),
  z.strictObject({ do: z.literal('press'), key: z.string().min(1).max(100).describe('A key or combination, as Enter or Control+A.') }),
  z.strictObject({ do: z.literal('hover'), target }),
  z.strictObject({ do: z.literal('scroll'), pixels: z.number().int().min(-20_000).max(20_000).describe('Pixels to scroll down; negative scrolls up.') }),
  z.strictObject({ do: z.literal('wait'), ms: z.number().int().min(0).max(60_000).describe('How long the picture holds.') }),
  z.strictObject({ do: z.literal('waitFor'), target }),
]);

/** One step of a recording. */
export type Step = z.output<typeof stepSchema>;

const side = z.number().int().min(320).max(1920).refine((pixels) => pixels % 2 === 0, 'A side is an even number of pixels.');

export const recordInputSchema = z.strictObject({
  url: address.describe('The page to record: http or https on localhost, 127.0.0.1, or [::1].'),
  steps: z.array(stepSchema).max(200).describe('What happens on the page, in order.').exactOptional(),
  file: z.string().min(1).max(1000).describe('The .mp4 file to write, in the workspace.'),
  width: side.describe('The width in pixels, 1280 by default.').exactOptional(),
  height: side.describe('The height in pixels, 720 by default.').exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const recordOutputSchema = z.object({
  file: z.string(),
  durationMs: z.number().int().nonnegative(),
  steps: z.array(z.object({ do: z.string(), atMs: z.number().int().nonnegative() })),
});
