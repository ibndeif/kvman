import { describe, expect, it } from 'vitest';
import { connectorRunOptions } from '../../src/calls/connector-run.ts';
import { stepOptions } from '../../src/turns/step.ts';

describe("kvcoder's jobs (08 §8.1, ADR 0009, 100)", () => {
  it('M2.4-E20 a step has no retries and 1 200 000 ms; a background connector run has no retries and an hour', () => {
    expect(stepOptions).toEqual({ retries: 0, timeoutMs: 1_200_000 });
    expect(connectorRunOptions).toEqual({ retries: 0, timeoutMs: 3_600_000 });
  });
});
