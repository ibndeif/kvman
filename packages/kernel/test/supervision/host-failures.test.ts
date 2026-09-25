import { describe, expect, it } from 'vitest';
import { HostFailures } from '../../src/index.ts';

const minute = 60_000;

describe('host failure charges (plan 03 §3.6)', () => {
  it('M1.7-E17 three charges within 10 minutes reach the limit; older ones do not count', () => {
    const failures = new HostFailures();
    expect(failures.charge('@acme/counter', 0)).toBe(false);
    expect(failures.charge('@acme/counter', 5 * minute)).toBe(false);
    expect(failures.charge('@acme/counter', 11 * minute)).toBe(false);
    expect(failures.charge('@acme/notes', 11 * minute)).toBe(false);
    expect(failures.charge('@acme/counter', 12 * minute)).toBe(true);
    expect(failures.charge('@acme/counter', 12 * minute)).toBe(false);
  });
});
