import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';

const json = (file: string): unknown => JSON.parse(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8'));

describe('kvvideo is bundled (11, ADR 0107, 11)', () => {
  it('M5.1-H8 the coder preset runs kvvideo, and the kvman package depends on it', () => {
    expect(z.object({ extensions: z.record(z.string(), z.string()) }).parse(json('packages/cli/presets/coder.json')).extensions['@kvman/kvvideo']).toBe('bundled');
    expect(z.object({ dependencies: z.record(z.string(), z.string()) }).parse(json('packages/cli/package.json')).dependencies['@kvman/kvvideo']).toBe('workspace:*');
  });
});
