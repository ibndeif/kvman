import { describe, expect, it } from 'vitest';
import { fileSchema, jobSchema, workspaceSchema } from '../src/index.ts';
import { fileRow, jobRow } from './sample-rows.ts';

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } | undefined }): string[] {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('rows (ADR 0009, 5 and 7)', () => {
  it('M1.2-E13 a job row has ISO times, a known status, and a UUIDv7 id', () => {
    expect(jobSchema.safeParse(jobRow).success).toBe(true);
    expect(issuePaths(jobSchema.safeParse({ ...jobRow, createdAt: 1727665200000 }))).toEqual(['createdAt']);
    expect(issuePaths(jobSchema.safeParse({ ...jobRow, status: 'paused' }))).toEqual(['status']);
    expect(issuePaths(jobSchema.safeParse({ ...jobRow, id: '0192a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b' }))).toEqual(['id']);
  });

  it('M1.2-E14 file rows and workspaces parse; a negative size or a kernel owner fails', () => {
    expect(fileSchema.safeParse(fileRow).success).toBe(true);
    expect(workspaceSchema.safeParse({ id: 'home', name: 'ahmed', path: '/home/ahmed' }).success).toBe(true);
    expect(issuePaths(fileSchema.safeParse({ ...fileRow, size: -1 }))).toEqual(['size']);
    expect(issuePaths(fileSchema.safeParse({ ...fileRow, owner: { kind: 'kernel' } }))).toEqual(['owner.kind']);
  });
});
