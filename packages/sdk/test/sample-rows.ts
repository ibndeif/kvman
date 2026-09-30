export const jobId = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

export const jobRow = {
  id: jobId,
  name: 'notes.reindex',
  input: {},
  workspaceId: 'home',
  caller: { kind: 'extension', name: '@acme/notes' },
  status: 'succeeded',
  attempts: 1,
  retries: 3,
  output: { count: 2 },
  createdAt: '2026-09-30T03:00:00.000Z',
  startedAt: '2026-09-30T03:00:00.010Z',
  endedAt: '2026-09-30T03:00:00.050Z',
};

export const fileRow = {
  id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
  name: 'notes.md',
  type: 'text/markdown',
  size: 12,
  owner: { kind: 'user' },
  workspaceId: 'home',
  createdAt: '2026-09-30T03:00:00.000Z',
};
