// The one workspace of a fixture kernel, written with its applied preset by the test helper (ADR 0124).
export const fixtureWorkspace = 'a'.repeat(64);

export const fixtureFolder = { workspaceId: fixtureWorkspace, path: '/w/a', name: 'A' } as const;
