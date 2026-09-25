import { z } from 'zod';

// The benchmark rules of ADRs 0103 and 0104: which metrics each benchmark reports, their 14 §14.6 targets, the
// median of rounds, and when a check or a recording fails.

export type Metrics = Record<string, number>;
export type Results = Record<string, Metrics>;

type Target = { max: number } | { min: number } | undefined;

// ADR 0105 set the round-trip p50 and the sustained rate from the M1.9 measurements; M7.2 re-measures.
export const benchmarkTargets: Record<string, Record<string, Target>> = {
  'command.round-trip': { p50Ms: { max: 10 }, p99Ms: { max: 25 } },
  'command.sustained': { perSecond: { min: 1000 } },
  'query.indexed': { p50Ms: undefined, p99Ms: { max: 20 } },
  'live.latency': { p50Ms: undefined, p99Ms: { max: 30 } },
};

export const regressionLimit = 0.2;

const machineSchema = z.strictObject({
  cpu: z.string().min(1), cores: z.number().int().positive(), memoryGb: z.number().positive(), os: z.string().min(1), node: z.string().min(1),
});

export type Machine = z.infer<typeof machineSchema>;

export const baselineSchema = z.strictObject({
  recordedAt: z.iso.datetime(),
  machine: machineSchema,
  benchmarks: z.record(z.string(), z.record(z.string(), z.number().nonnegative())),
});

export type Baseline = z.infer<typeof baselineSchema>;

export function readBaseline(text: string): Baseline {
  const parsed = baselineSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`bench/baseline.json is malformed:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

// A throughput is better higher; every other metric is a latency in milliseconds, better lower.
function higherIsBetter(metric: string): boolean {
  return metric === 'perSecond';
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

// Each metric's median across the rounds.
export function medianOfRounds(rounds: readonly Metrics[]): Metrics {
  const names = [...new Set(rounds.flatMap((round) => Object.keys(round)))];
  return Object.fromEntries(names.map((name) => [name, median(rounds.flatMap((round) => (round[name] === undefined ? [] : [round[name]])))]));
}

function targetMiss(benchmark: string, metric: string, value: number): string | undefined {
  const target = benchmarkTargets[benchmark]?.[metric];
  if (target === undefined) return undefined;
  if ('max' in target && value > target.max) return `${benchmark}.${metric} is ${value}, over its target of ${target.max}`;
  if ('min' in target && value < target.min) return `${benchmark}.${metric} is ${value}, under its target of ${target.min}`;
  return undefined;
}

function regression(benchmark: string, metric: string, value: number, baseline: number): string | undefined {
  const worse = higherIsBetter(metric) ? value < baseline * (1 - regressionLimit) : value > baseline * (1 + regressionLimit);
  return worse ? `${benchmark}.${metric} is ${value}, more than 20% worse than its baseline ${baseline}` : undefined;
}

// Every reason a check fails; an empty list passes (ADR 0103).
export function checkResults(results: Results, baseline: Baseline): string[] {
  const failures: string[] = [];
  for (const [benchmark, metrics] of Object.entries(results)) {
    const stored = baseline.benchmarks[benchmark];
    if (stored === undefined) {
      failures.push(`${benchmark} has no baseline`);
      continue;
    }
    for (const [metric, value] of Object.entries(metrics)) {
      const base = stored[metric];
      const miss = targetMiss(benchmark, metric, value);
      if (miss !== undefined) failures.push(miss);
      if (base === undefined) failures.push(`${benchmark}.${metric} has no baseline`);
      else {
        const worse = regression(benchmark, metric, value, base);
        if (worse !== undefined) failures.push(worse);
      }
    }
  }
  return failures;
}

// A new baseline, refused while any metric misses its target (a target changes only by an ADR, 14 §14.6).
export function baselineOf(results: Results, machine: Machine, recordedAt: Date): { ok: true; baseline: Baseline } | { ok: false; misses: string[] } {
  const misses = Object.entries(results).flatMap(([benchmark, metrics]) =>
    Object.entries(metrics).flatMap(([metric, value]) => targetMiss(benchmark, metric, value) ?? []));
  if (misses.length > 0) return { ok: false, misses };
  return { ok: true, baseline: { recordedAt: recordedAt.toISOString(), machine, benchmarks: results } };
}
