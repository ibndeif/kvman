import { describe, expect, it } from 'vitest';
import { artifactContentLimit, assertWithinLimit } from '../../src/artifacts/artifact-records.ts';

// A model call carries its arguments in one progress chunk of at most 64 KiB (plan 02 §2.13), so a write that large never
// arrives through a turn; the rule is still the connector's own, and it counts bytes.
describe("an artifact's size (08 §8.5, ADR 0009, 174)", () => {
  it('QA6-E3 content of exactly 64 KB is accepted, one byte more fails TOO_LARGE with the limit, and bytes count, not characters', () => {
    expect(artifactContentLimit).toBe(65_536);
    expect(() => assertWithinLimit('big', 'x'.repeat(65_536))).not.toThrow();
    expect(() => assertWithinLimit('big', 'x'.repeat(65_537))).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'TOO_LARGE', params: { limit: 65_536 } }) as unknown }) as Error);
    expect(() => assertWithinLimit('big', 'خ'.repeat(32_769))).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'TOO_LARGE' }) as unknown }) as Error);
  });
});
