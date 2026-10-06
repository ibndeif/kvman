import { describe, expect, it } from 'vitest';
import { jobOptions } from '../../src/job-options.ts';

describe("kvbuilder's job options (ADR 0009, 126)", () => {
  it('M2.5-E14 and QA34-H11 the timeouts, and retries 0 for every command, a preview call included', () => {
    expect(jobOptions).toEqual({
      'kvbuilder.ext.new': { retries: 0, timeoutMs: 600_000 },
      'kvbuilder.ext.check': { retries: 0, timeoutMs: 300_000 },
      'kvbuilder.ext.test': { retries: 0, timeoutMs: 600_000 },
      'kvbuilder.preview.start': { retries: 0, timeoutMs: 300_000 },
      'kvbuilder.preview.stop': { retries: 0 },
      'kvbuilder.preview.command.run': { retries: 0, timeoutMs: 120_000 },
      'kvbuilder.preset.new': { retries: 0 },
      'kvbuilder.preset.check': { retries: 0, timeoutMs: 300_000 },
    });
  });
});
