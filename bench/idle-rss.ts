import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Benchmark } from './benchmarks.ts';
import { runKvman } from './kvman-run.ts';
import { withBenchHome } from './measure.ts';
import { writeReferencePreset } from './reference-preset.ts';

// Idle RSS with the coder preset and the reference machine's 3 workers (plan 12 §12.3, ADR 0009, 115, 126): `VmRSS`
// read 5 s after the URL. It reads `/proc`, so it runs on Linux, where the benchmarks run (plan 12 §12.1).

function residentMegabytes(pid: number): number {
  const match = /^VmRSS:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
  if (match === null) throw new Error(`/proc/${String(pid)}/status has no VmRSS line`);
  return Number(match[1]) / 1024;
}

async function measure(): Promise<Record<string, number>> {
  if (process.platform !== 'linux') throw new Error('The idle RSS benchmark reads /proc, so it runs on Linux.');
  return withBenchHome(async (root) => {
    const run = await runKvman(root, ['--preset', writeReferencePreset(root)]);
    try {
      await delay(5000);
      return { mb: residentMegabytes(run.pid) };
    } finally {
      await run.stop();
    }
  });
}

export const idleRss: Benchmark = { name: 'rss.idle', targets: { mb: { max: 300 } }, measure };
