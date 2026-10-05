import { describe, expect, it } from 'vitest';
import { lineRunOptions } from '../../src/calls/shell-connector.ts';
import { stepOptions } from '../../src/turns/step.ts';

describe("kvcoder's jobs (08 §8.1 and §8.3, ADR 0009, 100)", () => {
  it('M2.4-E20 a step has no retries and 1 200 000 ms; a line in the shell has no retries and room past its longest timeout', () => {
    expect(stepOptions).toEqual({ retries: 0, timeoutMs: 1_200_000 });
    expect(lineRunOptions).toEqual({ retries: 0, timeoutMs: 660_000 });
  });
});
