import { z, type Ctx } from '@kvman/sdk';
import { insideWorkspace, workspaceRelative } from '../folders.ts';
import { binResult, runBin } from '../run-bin.ts';

// `ext new` (plan 09 §9.1–9.2): the folder must stay inside the workspace; `kvman-new` writes the scaffold and runs
// `npm install` in it. Its `folder` is absolute, so the answer reports it relative to the workspace.

export type NewProject = { folder: string; name: string; namespace: string; web: boolean };

export type NewProjectInput = { name: string; namespace: string; folder: string; web: boolean };

const newOutputSchema = z.object({ folder: z.string(), name: z.string(), namespace: z.string(), web: z.boolean() });

export async function newProject(ctx: Ctx, workspaceFolder: string, input: NewProjectInput, signal: AbortSignal): Promise<NewProject> {
  insideWorkspace(workspaceFolder, input.folder, 'folder');
  const run = await runBin('kvman-new', [input.folder, '--name', input.name, '--namespace', input.namespace, ...(input.web ? ['--web'] : [])], workspaceFolder, signal);
  const created = binResult(ctx.log, 'kvman-new', run, newOutputSchema);
  return { folder: workspaceRelative(workspaceFolder, created.folder), name: created.name, namespace: created.namespace, web: created.web };
}
