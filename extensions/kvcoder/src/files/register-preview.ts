import { readFile } from 'node:fs/promises';
import { z, type Ctx } from '@kvman/sdk';
import { edits } from '../connectors/payload-fields.ts';
import { notFound } from '../problems.ts';
import { applyEdits } from './edit-text.ts';
import { textOf } from './utf8-text.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// A file as an `fs edit` or `fs write` would leave it (plan 08 §8.6, ADR 0100, 16), for "Open diff" on an approval: the
// path is resolved and the edits applied by `fs`'s own rules, and nothing is written.

const inputSchema = z.union([z.strictObject({ path: z.string().min(1), edits }), z.strictObject({ path: z.string().min(1), content: z.string() })]);

async function currentText(real: string, requested: string): Promise<string> {
  const bytes = await readFile(real).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  return textOf(bytes, requested);
}

export function registerFilePreview(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.file.preview.get', {
    description: 'Gives a file as an fs edit or fs write would leave it, with its absolute path; writes nothing.',
    input: inputSchema,
    output: z.object({ path: z.string(), after: z.string() }),
    public: true,
    handle: async (input) => {
      const real = await resolveInWorkspace(ctx.job.workspace.path, input.path);
      const after = 'content' in input ? input.content : applyEdits(await currentText(real, input.path), input.edits).text;
      return { path: real, after };
    },
  });
}
