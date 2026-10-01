import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Benchmark } from './benchmarks.ts';
import { runKvman } from './kvman-run.ts';
import { withBenchHome } from './measure.ts';

// Idle RSS with the coder preset (plan 12 §12.3, ADR 0009, 115, 126): the bundled preset plus `kernel.workers: 3`,
// the 4-core reference machine's default, and `VmRSS` read 5 s after the URL. It reads `/proc`, so it runs on Linux,
// where the benchmarks run (plan 12 §12.1).

const coderPreset = fileURLToPath(new URL('../presets/coder.json', import.meta.url));

function residentMegabytes(pid: number): number {
  const match = /^VmRSS:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
  if (match === null) throw new Error(`/proc/${String(pid)}/status has no VmRSS line`);
  return Number(match[1]) / 1024;
}

async function measure(): Promise<Record<string, number>> {
  if (process.platform !== 'linux') throw new Error('The idle RSS benchmark reads /proc, so it runs on Linux.');
  return withBenchHome(async (root) => {
    const preset: unknown = JSON.parse(readFileSync(coderPreset, 'utf8'));
    const presetFile = path.join(root, 'coder-reference.json');
    writeFileSync(presetFile, JSON.stringify(withWorkers(preset)));
    const run = await runKvman(root, ['--preset', presetFile]);
    try {
      await delay(5000);
      return { mb: residentMegabytes(run.pid) };
    } finally {
      await run.stop();
    }
  });
}

function withWorkers(preset: unknown): unknown {
  if (typeof preset !== 'object' || preset === null || !('settings' in preset) || typeof preset.settings !== 'object') throw new Error('presets/coder.json has no settings');
  return { ...preset, settings: { ...preset.settings, 'kernel.workers': 3 } };
}

export const idleRss: Benchmark = { name: 'rss.idle', targets: { mb: { max: 300 } }, measure };
