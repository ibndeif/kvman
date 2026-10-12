import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe("kvcoder's stylesheet (08 §8.7, ADR 0062, 1)", () => {
  it('M2.4-E211 a button of an actions row never shrinks and keeps its label on one line', async () => {
    const styles = await readFile(new URL('../web/styles/kvcoder.css', import.meta.url), 'utf8');
    const rule = /^\.kvc-actions > \.kvc-button \{([^}]*)\}/m.exec(styles)?.[1] ?? '';
    expect(rule).toContain('flex: 0 0 auto');
    expect(rule).toContain('white-space: nowrap');
  });
});
