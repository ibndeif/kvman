import { describe, expect, it } from 'vitest';
import { jobOptions } from '../../src/job-options.ts';

describe("kvcustomizer's job options (ADR 0009, 126)", () => {
  it('M2.5-E14 the timeouts, and retries 0 for every command', () => {
    expect(jobOptions).toEqual({
      'kvcustomizer.ext.new': { retries: 0, timeoutMs: 600_000 },
      'kvcustomizer.ext.check': { retries: 0, timeoutMs: 300_000 },
      'kvcustomizer.ext.test': { retries: 0, timeoutMs: 600_000 },
      'kvcustomizer.preview.start': { retries: 0, timeoutMs: 300_000 },
      'kvcustomizer.preview.stop': { retries: 0 },
      'kvcustomizer.preset.new': { retries: 0 },
      'kvcustomizer.preset.check': { retries: 0, timeoutMs: 300_000 },
    });
  });
});
