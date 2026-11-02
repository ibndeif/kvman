import { ProblemError, z, type Ctx } from '@kvman/sdk';
import type { JsonValue } from '../schemas/records.ts';

// Images a registered command answers for the model (plan 08 §8.4; ADR 0115, 20 and 47): a command entry with
// `images: true` may answer `images`, 1 to 8 PNG or JPEG kernel files of at most 5 MiB each in the call's workspace.
// They are checked before the result is stored, kept in its details by id, and added to the tool result when it is
// sent to a model that takes images.

export const imageTypes: ReadonlySet<string> = new Set(['image/png', 'image/jpeg']);
const largestBytes = 5 * 1024 * 1024;

const imagesSchema = z.array(z.object({ fileId: z.string().min(1), name: z.string().min(1) })).min(1).max(8);

/** A result's image, by its kernel file. */
export type ResultImage = z.output<typeof imagesSchema>[number];

/** The images an answer names, checked; `undefined` when it names none. A wrong one throws `VALIDATION_FAILED`. */
export async function resultImages(ctx: Ctx, value: JsonValue | undefined): Promise<ResultImage[] | undefined> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value['images'] === undefined) return undefined;
  const parsed = imagesSchema.safeParse(value['images']);
  if (!parsed.success) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'images is 1 to 8 { fileId, name }.' });
  for (const image of parsed.data) {
    const file = await ctx.files.get(image.fileId).catch((error: unknown) => {
      if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') throw new ProblemError({ code: 'VALIDATION_FAILED', message: `The image ${image.name} isn't a file of this workspace.` });
      throw error;
    });
    if (!imageTypes.has(file.type) || file.size > largestBytes || file.workspaceId !== ctx.job.workspace.id) throw new ProblemError({ code: 'VALIDATION_FAILED', message: `The image ${image.name} must be a PNG or JPEG of at most 5 MiB in this workspace.` });
  }
  return parsed.data;
}

/** The images kept in a stored result's details. */
export function storedImages(details: JsonValue | undefined): ResultImage[] {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return [];
  const parsed = imagesSchema.safeParse(details['images']);
  return parsed.success ? parsed.data : [];
}
