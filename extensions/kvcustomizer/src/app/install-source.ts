import type { ExtensionSource } from '@kvman/sdk';
import { projectAt } from '../folders.ts';
import { invalid } from '../problems.ts';

// The source `kvman extensions-install` stores (plan 09 §9.1, ADR 0022, 6). The kernel resolves a `path:` folder
// against the preset file, and a project the agent built is in the workspace, so the folder is resolved here against
// the workspace folder, checked to be the project named, and stored absolute. Other sources pass as they are.

const pathPrefix = 'path:';

export function installSource(workspaceFolder: string, name: string, source: ExtensionSource): ExtensionSource {
  if (!source.startsWith(pathPrefix)) return source;
  const folder = source.slice(pathPrefix.length);
  const project = projectAt(workspaceFolder, folder);
  if (project.manifest.name !== name) {
    throw invalid(`The project in ${folder} is named ${project.manifest.name}, not ${name}; install it under its own name.`, { name, folder, project: project.manifest.name });
  }
  return `${pathPrefix}${project.folder}`;
}
