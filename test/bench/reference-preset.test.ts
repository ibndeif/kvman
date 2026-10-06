import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writeReferencePreset } from '../../bench/reference-preset.ts';

const read = (file: string): { extensions: unknown; settings: Record<string, unknown> } => JSON.parse(readFileSync(file, 'utf8')) as { extensions: unknown; settings: Record<string, unknown> };

describe('the preset of the start benchmarks (plan 12 §12.3, ADR 0011, 27)', () => {
  it("QA18-H28 cold start and idle RSS both run the coder preset with the reference machine's 3 workers", () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bench-preset-'));
    try {
      const coder = read(fileURLToPath(new URL('../../packages/cli/presets/coder.json', import.meta.url)));
      const reference = read(writeReferencePreset(root));
      expect(reference.extensions).toEqual(coder.extensions);
      expect(reference.settings).toEqual({ ...coder.settings, 'kernel.workers': 3 });
      for (const benchmark of ['cold-start.ts', 'idle-rss.ts']) {
        expect(readFileSync(fileURLToPath(new URL(`../../bench/${benchmark}`, import.meta.url)), 'utf8'), benchmark).toContain("runKvman(root, ['--preset', writeReferencePreset(root)])");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
