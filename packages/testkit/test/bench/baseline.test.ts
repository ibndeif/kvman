import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { benchmarkTargets, checkResults, readBaseline } from '../../bench/rules.ts';

const baselineFile = new URL('../../../../bench/baseline.json', import.meta.url);

describe('the stored benchmark baseline (plan 14 §14.6, ADRs 0103–0105)', () => {
  it('M1.9-H13 the stored baseline holds every M1.9 benchmark and meets its targets', () => {
    const baseline = readBaseline(readFileSync(baselineFile, 'utf8'));
    expect(baseline.machine.cores).toBeGreaterThan(0);
    expect(Object.fromEntries(Object.entries(baseline.benchmarks).map(([name, metrics]) => [name, Object.keys(metrics).sort()]))).toEqual({
      'command.round-trip': ['p50Ms', 'p99Ms'], 'command.sustained': ['perSecond'], 'query.indexed': ['p50Ms', 'p99Ms'], 'live.latency': ['p50Ms', 'p99Ms'],
    });
    expect(Object.keys(benchmarkTargets).sort()).toEqual(Object.keys(baseline.benchmarks).sort());
    expect(checkResults(baseline.benchmarks, baseline)).toEqual([]);
  });

  it('M1.9-E13 a malformed baseline file is refused with its path', () => {
    const malformed = { recordedAt: '2026-09-26T00:00:00.000Z', machine: { cpu: 'x', cores: 4, memoryGb: 16, os: 'linux', node: 'v24' }, benchmarks: { 'command.round-trip': { p50Ms: 'fast' } } };
    expect(() => readBaseline(JSON.stringify(malformed))).toThrow('benchmarks["command.round-trip"].p50Ms');
  });
});
