import type { InstallSource } from '@kvman/sdk';
import { projectAt } from '../folders.ts';

// The source `kvman extensions-install` sends (plan 09 §9.1, ADR 0022, 6, ADR 0025). The kernel resolves a `path:` folder
// against the preset file, and a project the agent built is in the workspace, so the folder is resolved here against
// the workspace folder, checked to be a project, and sent absolute. Other sources pass as they are.

const pathPrefix = 'path:';

export function installSource(workspaceFolder: string, source: InstallSource): InstallSource {
  if (!source.startsWith(pathPrefix)) return source;
  return `${pathPrefix}${projectAt(workspaceFolder, source.slice(pathPrefix.length)).folder}`;
}
