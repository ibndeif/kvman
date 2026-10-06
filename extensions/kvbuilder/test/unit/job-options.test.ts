import { describe, expect, it } from 'vitest';
import { jobOptions } from '../../src/job-options.ts';

describe("kvcustomizer's job options (ADR 0009, 126)", () => {
  it('M2.5-E14 and QA34-H11 the timeouts, and retries 0 for every command, a preview call included', () => {
    expect(jobOptions).toEqual({
      'kvcustomizer.ext.new': { retries: 0, timeoutMs: 600_000 },
      'kvcustomizer.ext.check': { retries: 0, timeoutMs: 300_000 },
      'kvcustomizer.ext.test': { retries: 0, timeoutMs: 600_000 },
      'kvcustomizer.preview.start': { retries: 0, timeoutMs: 300_000 },
      'kvcustomizer.preview.stop': { retries: 0 },
      'kvcustomizer.preview.command.run': { retries: 0, timeoutMs: 120_000 },
      'kvcustomizer.preset.new': { retries: 0 },
      'kvcustomizer.preset.check': { retries: 0, timeoutMs: 300_000 },
    });
  });
});
