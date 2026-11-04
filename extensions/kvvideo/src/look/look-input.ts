import { z } from '@kvman/sdk';
import { address, side } from '../record/steps.ts';

// `look`'s input and answer (plan 16 §16.5 Looking; ADR 0117, 19): a website or a page as `record` opens it, and 1 to 6
// distinct moments of its clock, `[1000]` when left out.

const moment = z.number().int().min(0).max(60_000);

const lookFields = z.strictObject({
  url: address.describe('A website to look at: any http or https address.').exactOptional(),
  page: z.string().min(1).max(1000).describe('An .html file of the workspace to look at, with the files beside it.').exactOptional(),
  atMs: z
    .array(moment)
    .min(1)
    .max(6)
    .refine((moments) => new Set(moments).size === moments.length, 'Each moment is given once.')
    .describe("The moments to show, in ms from the page's clock start (0 to 60000); 1000 when left out.")
    .exactOptional(),
  width: side.describe('The page width in CSS pixels: 1280 by default, 390 on a phone.').exactOptional(),
  height: side.describe('The page height in CSS pixels: 720 by default, 844 on a phone.').exactOptional(),
  device: z.enum(['desktop', 'phone']).describe('desktop (the default), or phone.').exactOptional(),
});

export const lookInputSchema = lookFields.superRefine((input, context) => {
  if ((input.url === undefined) === (input.page === undefined)) context.addIssue({ code: 'custom', path: ['url'], message: 'Give exactly one of url and page.' });
});

/** `look`'s input. */
export type LookInput = z.output<typeof lookInputSchema>;

export const lookOutputSchema = z.object({ images: z.array(z.object({ fileId: z.string(), name: z.string(), atMs: moment })) });
