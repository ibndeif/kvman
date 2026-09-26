import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// A folder holding the given files (path → content), for the install pipeline's pure checks.
export function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'kvman-tree-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

export async function failure(work: Promise<unknown>): Promise<{ code: string; details: { detail: string; params?: unknown; hint?: string } }> {
  try {
    await work;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'details' in error) {
      const { code, details } = error;
      if (typeof code === 'string' && typeof details === 'object' && details !== null && 'detail' in details && typeof details.detail === 'string') return { code, details: { ...details, detail: details.detail } };
    }
    throw error;
  }
  throw new Error('expected an install failure');
}
