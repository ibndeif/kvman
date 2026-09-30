import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared by the benchmarks: timing, percentiles, and homes on the disk (never a tmpfs, where fsync costs nothing).

const homesFolder = fileURLToPath(new URL('.homes/', import.meta.url));

export async function withBenchHome<Result>(run: (home: string) => Promise<Result>): Promise<Result> {
  mkdirSync(homesFolder, { recursive: true });
  const home = mkdtempSync(path.join(homesFolder, 'home-'));
  try {
    return await run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

export async function timedRuns(count: number, run: (index: number) => Promise<unknown>): Promise<number[]> {
  const durations: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    await run(index);
    durations.push(performance.now() - start);
  }
  return durations;
}
