import type { Benchmark } from './benchmarks.ts';
import { runKvman } from './kvman-run.ts';
import { withBenchHome } from './measure.ts';

// Cold start to URL with the bundled coder preset (plan 12 §12.3, ADR 0009, 126): each round is one start on a new
// home, so the stored metric is the median of the rounds.

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (root) => {
    const run = await runKvman(root, ['--preset', 'coder']);
    await run.stop();
    return { ms: run.msToUrl };
  });
}

export const coldStart: Benchmark = { name: 'start.cold', targets: { ms: { max: 3000 } }, measure };
