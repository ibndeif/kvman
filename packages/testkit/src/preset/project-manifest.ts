import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';

// Where a `path:` extension's namespace comes from (ADR 0009, 121): the folder, relative to the preset file, must
// hold a package.json with a `kvman` field. Anything else means the folder isn't a project.

const manifestSchema = z
  .object({
    kvman: z.object({ namespace: z.string() }).loose(),
  })
  .loose();

/** The namespace of the project in `folder`, or `undefined` when it has no package.json with a `kvman` field. */
export function readProjectManifest(folder: string): { namespace: string } | undefined {
  const file = path.join(folder, 'package.json');
  if (!existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return { namespace: parsed.data.kvman.namespace };
}
