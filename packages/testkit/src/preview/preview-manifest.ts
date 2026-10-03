import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';

// The project check (plan 09 §9.3, ADR 0009, 121): a folder is a project when its package.json has a `kvman` field.
// The preview needs the package name for the generated preset and the scripts for `web:watch`.

const manifestSchema = z
  .object({
    name: z.string(),
    scripts: z.record(z.string(), z.string()).optional(),
    kvman: z.object({ namespace: z.string() }).loose(),
  })
  .loose();

/** A project: its package name and whether it has a `web:watch` script. */
export type PreviewProject = { name: string; folder: string; webWatch: boolean };

/** Reads the project in `folder`, or `undefined` when it has no package.json with a `kvman` field. */
export function readPreviewProject(folder: string): PreviewProject | undefined {
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
  return { name: parsed.data.name, folder, webWatch: parsed.data.scripts?.['web:watch'] !== undefined };
}
