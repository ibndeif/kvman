// The benchmark rules of plan 12 §12.3: a metric fails on a missed target, or on a regression of more than 20% from
// the stored baseline. A `max` target is a latency (lower is better); a `min` target is a throughput (higher is better).

export type Target = { max: number } | { min: number };
export type Metrics = Record<string, number>;
export type Results = Record<string, Metrics>;
export type Targets = Record<string, Record<string, Target>>;
export type Baseline = { recordedAt: string; benchmarks: Results };

export const regressionLimit = 0.2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMetrics(value: unknown): value is Metrics {
  return isRecord(value) && Object.values(value).every((metric) => typeof metric === 'number' && Number.isFinite(metric));
}

export function parseBaseline(text: string): Baseline {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || typeof parsed['recordedAt'] !== 'string' || !isRecord(parsed['benchmarks'])) {
    throw new Error('bench/baseline.json is malformed');
  }
  const benchmarks: Results = {};
  for (const [name, metrics] of Object.entries(parsed['benchmarks'])) {
    if (!isMetrics(metrics)) throw new Error(`bench/baseline.json has malformed metrics for ${name}`);
    benchmarks[name] = metrics;
  }
  return { recordedAt: parsed['recordedAt'], benchmarks };
}

function targetMiss(benchmark: string, metric: string, value: number, target: Target): string | undefined {
  if ('max' in target && value > target.max) return `${benchmark}.${metric} is ${value}, over its target of ${target.max}`;
  if ('min' in target && value < target.min) return `${benchmark}.${metric} is ${value}, under its target of ${target.min}`;
  return undefined;
}

function regression(benchmark: string, metric: string, value: number, base: number, target: Target): string | undefined {
  const worse = 'min' in target ? value < base * (1 - regressionLimit) : value > base * (1 + regressionLimit);
  return worse ? `${benchmark}.${metric} is ${value}, more than 20% worse than its baseline of ${base}` : undefined;
}

function metricFailures(benchmark: string, metrics: Metrics, targets: Record<string, Target>, stored: Metrics): string[] {
  return Object.entries(metrics).flatMap(([metric, value]) => {
    const target = targets[metric];
    if (target === undefined) return [`${benchmark}.${metric} has no target`];
    const base = stored[metric];
    const failures = [targetMiss(benchmark, metric, value, target)];
    failures.push(base === undefined ? `${benchmark}.${metric} has no baseline` : regression(benchmark, metric, value, base, target));
    return failures.filter((failure) => failure !== undefined);
  });
}

// Every reason a check fails; an empty list passes.
export function checkResults(results: Results, targets: Targets, baseline: Baseline | undefined): string[] {
  return Object.entries(results).flatMap(([benchmark, metrics]) => {
    const stored = baseline?.benchmarks[benchmark];
    if (stored === undefined) return [`${benchmark} has no baseline; run pnpm bench:record`];
    return metricFailures(benchmark, metrics, targets[benchmark] ?? {}, stored);
  });
}

// A new baseline, refused while any metric misses its target (a target changes only by an ADR).
export function recordBaseline(results: Results, targets: Targets, recordedAt: Date): { ok: true; baseline: Baseline } | { ok: false; misses: string[] } {
  const misses = Object.entries(results).flatMap(([benchmark, metrics]) =>
    Object.entries(metrics).flatMap(([metric, value]) => {
      const target = targets[benchmark]?.[metric];
      if (target === undefined) return [`${benchmark}.${metric} has no target`];
      return targetMiss(benchmark, metric, value, target) ?? [];
    }));
  if (misses.length > 0) return { ok: false, misses };
  return { ok: true, baseline: { recordedAt: recordedAt.toISOString(), benchmarks: results } };
}
