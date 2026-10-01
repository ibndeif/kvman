import { describe, expect, it } from 'vitest';
import { jobOptions } from '../../src/job-options.ts';

describe("kvdev's job options (ADR 0009, 126)", () => {
  it('M2.5-E14 the timeouts, and retries 0 for every command', () => {
    expect(jobOptions).toEqual({
      'kvdev.ext.new': { retries: 0, timeoutMs: 600_000 },
      'kvdev.ext.check': { retries: 0, timeoutMs: 300_000 },
      'kvdev.ext.test': { retries: 0, timeoutMs: 600_000 },
      'kvdev.preview.start': { retries: 0, timeoutMs: 300_000 },
      'kvdev.preview.stop': { retries: 0 },
      'kvdev.preset.new': { retries: 0 },
    });
  });
});
