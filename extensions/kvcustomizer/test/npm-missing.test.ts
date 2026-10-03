import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();
const saved = { ...process.env };
const roots: string[] = [];

afterEach(() => {
  process.env = { ...saved };
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('npm missing (ADR 0009, 126)', { timeout: 30_000 }, () => {
  it('M2.5-E6 npm missing from the PATH fails kvcustomizer/NPM_FAILED', async () => {
    const emptyBin = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-no-npm-'));
    roots.push(emptyBin);
    process.env['PATH'] = emptyBin;
    const world = await kvcustomizer.start();
    await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' })).rejects.toEqual(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'kvcustomizer/NPM_FAILED', message: "npm isn't on the PATH; install Node.js with npm." }) }),
    );
  });
});
