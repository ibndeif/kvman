import { describe, expect, it } from 'vitest';
import { completeTimeoutMs } from '../src/register-complete.ts';

describe("kvai.complete's time limit (plan 07 §7.1, ADR 0102, 10)", () => {
  it('QA67-H19 a model call may run 30 minutes', () => {
    expect(completeTimeoutMs).toBe(1_800_000);
  });
});
