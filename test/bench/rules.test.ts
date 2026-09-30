import { describe, expect, it } from 'vitest';
import { checkResults, parseBaseline, recordBaseline, type Baseline, type Targets } from '../../bench/rules.ts';

const targets: Targets = { exec: { p99Ms: { max: 5 } }, queue: { perSecond: { min: 500 } } };

function baselineOf(p99Ms: number, perSecond: number): Baseline {
  return { recordedAt: '2026-09-30T00:00:00.000Z', benchmarks: { exec: { p99Ms }, queue: { perSecond } } };
}

describe('benchmark rules (plan 12 §12.3)', () => {
  it('M1.1-E32 a metric that misses its target fails the check', () => {
    const baseline = baselineOf(4, 600);
    expect(checkResults({ exec: { p99Ms: 6 } }, targets, baseline)).toEqual(['exec.p99Ms is 6, over its target of 5', 'exec.p99Ms is 6, more than 20% worse than its baseline of 4']);
    expect(checkResults({ queue: { perSecond: 499 } }, targets, baselineOf(4, 520))).toEqual(['queue.perSecond is 499, under its target of 500']);
  });

  it('M1.1-E33 a regression of more than 20% from the baseline fails', () => {
    const baseline = baselineOf(1, 1000);
    expect(checkResults({ exec: { p99Ms: 1.21 } }, targets, baseline)).toEqual(['exec.p99Ms is 1.21, more than 20% worse than its baseline of 1']);
    expect(checkResults({ queue: { perSecond: 790 } }, targets, baseline)).toEqual(['queue.perSecond is 790, more than 20% worse than its baseline of 1000']);
    expect(checkResults({ exec: { p99Ms: 1.19 }, queue: { perSecond: 810 } }, targets, baseline)).toEqual([]);
  });

  it('M1.1-E34 a benchmark without a baseline fails, and recording refuses a missed target', () => {
    expect(checkResults({ exec: { p99Ms: 1 } }, targets, undefined)).toEqual(['exec has no baseline; run pnpm bench:record']);
    expect(recordBaseline({ exec: { p99Ms: 6 } }, targets, new Date(0))).toEqual({ ok: false, misses: ['exec.p99Ms is 6, over its target of 5'] });
    const recorded = recordBaseline({ exec: { p99Ms: 1 } }, targets, new Date(0));
    expect(recorded).toEqual({ ok: true, baseline: { recordedAt: '1970-01-01T00:00:00.000Z', benchmarks: { exec: { p99Ms: 1 } } } });
    if (recorded.ok) expect(parseBaseline(JSON.stringify(recorded.baseline))).toEqual(recorded.baseline);
  });
});
