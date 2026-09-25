import { describe, expect, it } from 'vitest';
import { baselineOf, checkResults, medianOfRounds, type Baseline, type Results } from '../../bench/rules.ts';

const machine = { cpu: 'Test CPU', cores: 4, memoryGb: 16, os: 'linux 7.0', node: 'v24.21.0' };

function baseline(benchmarks: Baseline['benchmarks']): Baseline {
  return { recordedAt: '2026-09-26T00:00:00.000Z', machine, benchmarks };
}

const complete: Results = {
  'command.round-trip': { p50Ms: 8, p99Ms: 12 },
  'command.sustained': { perSecond: 1400 },
  'query.indexed': { p50Ms: 5, p99Ms: 8 },
  'live.latency': { p50Ms: 0.2, p99Ms: 0.6 },
};

describe('benchmark rules (plan 14 §14.6, ADRs 0103–0105)', () => {
  it('M1.9-E8 a metric more than 20% worse than its baseline fails, and exactly 20% passes', () => {
    const stored = baseline({ 'query.indexed': { p99Ms: 10 }, 'command.sustained': { perSecond: 5000 } });
    expect(checkResults({ 'query.indexed': { p99Ms: 12.01 } }, stored)).toEqual(['query.indexed.p99Ms is 12.01, more than 20% worse than its baseline 10']);
    expect(checkResults({ 'query.indexed': { p99Ms: 12 } }, stored)).toEqual([]);
    expect(checkResults({ 'command.sustained': { perSecond: 3999 } }, stored)).toEqual(['command.sustained.perSecond is 3999, more than 20% worse than its baseline 5000']);
    expect(checkResults({ 'command.sustained': { perSecond: 4000 } }, stored)).toEqual([]);
    expect(checkResults({ 'query.indexed': { p99Ms: 2 } }, stored)).toEqual([]);
  });

  it('M1.9-E9 a metric that misses its target fails even within 20% of its baseline', () => {
    const failures = checkResults({ 'command.round-trip': { p50Ms: 10.2 } }, baseline({ 'command.round-trip': { p50Ms: 9.5 } }));
    expect(failures).toEqual(['command.round-trip.p50Ms is 10.2, over its target of 10']);
  });

  it('M1.9-E10 a benchmark or metric without a baseline value fails', () => {
    const { 'live.latency': _live, ...withoutLive } = complete;
    expect(checkResults(complete, baseline(withoutLive))).toEqual(['live.latency has no baseline']);
    const withoutMetric = { ...complete, 'query.indexed': { p50Ms: 5 } };
    expect(checkResults(complete, baseline(withoutMetric))).toEqual(['query.indexed.p99Ms has no baseline']);
    expect(checkResults(complete, baseline(complete))).toEqual([]);
  });

  it('M1.9-E11 a metric is the median of its 5 rounds', () => {
    const rounds = [3, 3.1, 40, 2.9, 3].map((p99Ms) => ({ p99Ms, p50Ms: 1 }));
    expect(medianOfRounds(rounds)).toEqual({ p99Ms: 3, p50Ms: 1 });
  });

  it('M1.9-E12 recording refuses to write a baseline that misses a target', () => {
    const recorded = baselineOf({ ...complete, 'command.sustained': { perSecond: 900 } }, machine, new Date('2026-09-26T00:00:00.000Z'));
    expect(recorded).toEqual({ ok: false, misses: ['command.sustained.perSecond is 900, under its target of 1000'] });
    expect(baselineOf(complete, machine, new Date('2026-09-26T00:00:00.000Z'))).toEqual({ ok: true, baseline: baseline(complete) });
  });
});
