import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { benchmarks } from './benchmarks.ts';
import { checkResults, medianOfRounds, parseBaseline, recordBaseline, type Baseline, type Metrics, type Results, type Targets } from './rules.ts';

// `pnpm bench:check` compares every benchmark with its targets and bench/baseline.json; `pnpm bench:record` rewrites it.
// Each benchmark runs several rounds, and each metric is its median across them, so one noisy round decides nothing.

const rounds = 5;

const baselineFile = fileURLToPath(new URL('baseline.json', import.meta.url));

function readBaseline(): Baseline | undefined {
  return existsSync(baselineFile) ? parseBaseline(readFileSync(baselineFile, 'utf8')) : undefined;
}

async function measureAll(): Promise<{ results: Results; targets: Targets }> {
  const results: Results = {};
  const targets: Targets = {};
  for (const benchmark of benchmarks) {
    const measured: Metrics[] = [];
    for (let round = 0; round < rounds; round += 1) measured.push(await benchmark.measure());
    results[benchmark.name] = medianOfRounds(measured);
    targets[benchmark.name] = benchmark.targets;
    console.log(`${benchmark.name}: ${JSON.stringify(results[benchmark.name])}`);
  }
  return { results, targets };
}

async function main(mode: string | undefined): Promise<number> {
  if (mode !== 'check' && mode !== 'record') {
    console.error('usage: node bench/main.ts check | record');
    return 2;
  }
  if (benchmarks.length === 0) {
    console.log('bench: there are no benchmarks yet');
    return 0;
  }
  const { results, targets } = await measureAll();
  if (mode === 'record') {
    const recorded = recordBaseline(results, targets, new Date());
    if (!recorded.ok) {
      for (const miss of recorded.misses) console.error(`not recorded: ${miss}`);
      return 1;
    }
    writeFileSync(baselineFile, `${JSON.stringify(recorded.baseline, null, 2)}\n`);
    console.log(`recorded ${baselineFile}`);
    return 0;
  }
  const failures = checkResults(results, targets, readBaseline());
  for (const failure of failures) console.error(`bench:check failed: ${failure}`);
  if (failures.length === 0) console.log('bench:check passed');
  return failures.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv[2]);
