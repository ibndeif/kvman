import type { Benchmark } from './benchmarks.ts';
import { runKvman } from './kvman-run.ts';
import { withBenchHome } from './measure.ts';
import { writeReferencePreset } from './reference-preset.ts';

// Cold start to URL with the coder preset and the reference machine's 3 workers (plan 12 §12.3, ADR 0009, 126;
// ADR 0011, 27): each round is one start on a new home, so the stored metric is the median of the rounds.

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (root) => {
    const run = await runKvman(root, ['--preset', writeReferencePreset(root)]);
    await run.stop();
    return { ms: run.msToUrl };
  });
}

export const coldStart: Benchmark = { name: 'start.cold', targets: { ms: { max: 3000 } }, measure };
