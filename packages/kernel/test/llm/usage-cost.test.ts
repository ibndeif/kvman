import { describe, expect, it } from 'vitest';
import { costOf } from '../../src/llm/usage-cost.ts';

describe('usage cost (05 §5.11, ADR 0153)', () => {
  it('M2.9-E2 costOf prefers the result cost, then the model prices, else null', () => {
    expect(costOf(
      { costUsd: 0.25, usage: { input: 1000, output: 500 } },
      { cost: { inputPerMTok: 1, outputPerMTok: 2 } },
    )).toBe(0.25);
    expect(costOf(
      { usage: { input: 1000, output: 500, cacheRead: 100, cacheWrite: 200 } },
      { cost: { inputPerMTok: 1, outputPerMTok: 2 } },
    )).toBeCloseTo(0.002, 10);
    expect(costOf({ usage: { input: 1000, output: 500 } }, {})).toBeNull();
    expect(costOf({ usage: { input: 1000, output: 500 } }, undefined)).toBeNull();
  });
});
