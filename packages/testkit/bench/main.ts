import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchKernel } from '../test/child-kernel/launch.ts';
import { benchmarks, type Benchmark } from './benchmarks.ts';
import { baselineOf, benchmarkTargets, checkResults, medianOfRounds, readBaseline, type Baseline, type Machine, type Metrics, type Results } from './rules.ts';

// `pnpm bench:check` and `pnpm bench:record` (ADR 0103): every benchmark warms up, runs 5 rounds, and reports the
// median of each metric; check compares with bench/baseline.json, record rewrites it.

const rounds = 5;
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const baselineFile = join(repositoryRoot, 'bench', 'baseline.json');
// On the disk, never a tmpfs: fsync is part of what a durable command costs (ADR 0001).
const homesFolder = join(repositoryRoot, 'bench', '.homes');

function machine(): Machine {
  return {
    cpu: cpus()[0]?.model.trim() ?? 'unknown', cores: availableParallelism(), memoryGb: Math.round(totalmem() / 1024 ** 3),
    os: `${platform()} ${release()}`, node: process.version,
  };
}

async function measure(benchmark: Benchmark): Promise<Metrics> {
  mkdirSync(homesFolder, { recursive: true });
  const folder = mkdtempSync(join(homesFolder, 'bench-'));
  const kernel = await launchKernel({ home: join(folder, 'home'), fixture: 'bench' });
  try {
    await benchmark.prepare(kernel.port);
    await benchmark.warmUp(kernel.port);
    const measured: Metrics[] = [];
    for (let index = 0; index < rounds; index += 1) measured.push(await benchmark.round(kernel.port, index));
    return medianOfRounds(measured);
  } finally {
    await kernel.stop();
    rmSync(folder, { recursive: true, force: true });
  }
}

function rounded(value: number | undefined): string {
  return value === undefined ? '—' : String(Math.round(value * 100) / 100);
}

function printTable(results: Results, baseline: Baseline | undefined): void {
  const rows = Object.entries(results).flatMap(([benchmark, metrics]) => Object.entries(metrics).map(([metric, value]) => {
    const base = baseline?.benchmarks[benchmark]?.[metric];
    const change = base === undefined || base === 0 ? '—' : `${Math.round(((value - base) / base) * 1000) / 10}%`;
    const target = benchmarkTargets[benchmark]?.[metric];
    const goal = target === undefined ? '—' : 'max' in target ? `≤ ${target.max}` : `≥ ${target.min}`;
    return [`${benchmark}.${metric}`, rounded(value), rounded(base), change, goal];
  }));
  const header = ['metric', 'value', 'baseline', 'change', 'target'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)));
  for (const row of [header, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  '));
}

async function main(mode: string | undefined): Promise<number> {
  if (mode !== 'check' && mode !== 'record') {
    console.error('usage: bench/main.ts check | record');
    return 2;
  }
  const baseline = existsSync(baselineFile) ? readBaseline(readFileSync(baselineFile, 'utf8')) : undefined;
  const results: Results = {};
  for (const benchmark of benchmarks) {
    results[benchmark.name] = await measure(benchmark);
    console.log(`measured ${benchmark.name}`);
  }
  printTable(results, baseline);
  if (mode === 'record') {
    const recorded = baselineOf(results, machine(), new Date());
    if (!recorded.ok) {
      for (const miss of recorded.misses) console.error(`not recorded: ${miss}`);
      return 1;
    }
    writeFileSync(baselineFile, `${JSON.stringify(recorded.baseline, null, 2)}\n`);
    console.log(`recorded ${baselineFile}`);
    return 0;
  }
  const failures = checkResults(results, baseline ?? { recordedAt: new Date(0).toISOString(), machine: machine(), benchmarks: {} });
  for (const failure of failures) console.error(`bench:check failed: ${failure}`);
  if (failures.length === 0) console.log('bench:check passed');
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv[2]);
