import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { invalid, kvdevProblem } from './problems.ts';

// Where kvdev reads and writes (ADR 0009, 121, 126): every `folder` and `file` resolves against the workspace folder
// and must stay inside it. A project is a folder whose package.json has a `kvman` field.

export type ProjectManifest = { name: string; version: string; namespace: string; scripts: Record<string, string> };

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    scripts: z.record(z.string(), z.string()).optional(),
    kvman: z.object({ namespace: z.string() }).loose(),
  })
  .loose();

/** The absolute path of `relative` inside the workspace folder. */
export function insideWorkspace(workspaceFolder: string, relative: string, what: string): string {
  const resolved = path.resolve(workspaceFolder, relative);
  const fromWorkspace = path.relative(workspaceFolder, resolved);
  if (fromWorkspace.startsWith('..') || path.isAbsolute(fromWorkspace)) {
    throw invalid(`The ${what} ${relative} is outside the workspace folder ${workspaceFolder}.`, { [what]: relative });
  }
  return resolved;
}

/** A path as kvdev reports it: relative to the workspace folder, with `/`, and `.` for the folder itself. */
export function workspaceRelative(workspaceFolder: string, absolute: string): string {
  return path.relative(workspaceFolder, absolute).split(path.sep).join('/') || '.';
}

/** The project manifest in `folder`, or `undefined` when it has no package.json with a `kvman` field. */
export function readProjectManifest(folder: string): ProjectManifest | undefined {
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
  return { name: parsed.data.name, version: parsed.data.version, namespace: parsed.data.kvman.namespace, scripts: parsed.data.scripts ?? {} };
}

/** The project in `folder`, which must be inside the workspace folder; `kvdev/NOT_A_PROJECT` otherwise. */
export function projectAt(workspaceFolder: string, folder: string): { folder: string; manifest: ProjectManifest } {
  const absolute = insideWorkspace(workspaceFolder, folder, 'folder');
  const manifest = readProjectManifest(absolute);
  if (manifest === undefined) throw kvdevProblem('NOT_A_PROJECT', `${folder} has no package.json with a kvman field.`, { folder });
  return { folder: absolute, manifest };
}
