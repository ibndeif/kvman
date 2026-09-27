import { dirname, join } from 'node:path';

// The one workspace of a fixture kernel, written with its applied preset by the test helper (ADR 0124).
export const fixtureWorkspace = 'a'.repeat(64);

export const fixtureFolder = { workspaceId: fixtureWorkspace, path: '/w/a', name: 'A' } as const;

// A fixture workspace with a real folder, beside the home folder, for fixtures that start processes in it.
export function workspaceFolderOf(home: string): string {
  return join(dirname(home), 'workspace');
}
