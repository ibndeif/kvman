import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createTestKernel } from '../packages/testkit/src/index.ts';
import type { Benchmark } from './benchmarks.ts';
import { percentile, timedRuns, withBenchHome } from './measure.ts';

// A sync no-op query through the kernel: main thread → worker → main thread (plan 12 §12.3).

const noopEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('noop.get', { description: 'Does nothing.', input: z.object({}), output: z.object({}), public: true, handle: () => ({}) });
};
`;

function writeNoopExtension(folder: string): void {
  mkdirSync(folder);
  const manifest = { name: '@bench/noop', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'noop', source: 'index.ts' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), noopEntry);
}

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (root) => {
    const folder = path.join(root, 'noop');
    writeNoopExtension(folder);
    const kernel = await createTestKernel({ extensions: [folder], logLevel: 'error' });
    try {
      await timedRuns(500, () => kernel.exec('noop.get', {}));
      const durations = await timedRuns(5000, () => kernel.exec('noop.get', {}));
      return { p50Ms: percentile(durations, 0.5), p99Ms: percentile(durations, 0.99) };
    } finally {
      await kernel.close();
    }
  });
}

export const execNoop: Benchmark = { name: 'exec.noop', targets: { p50Ms: { max: 1 }, p99Ms: { max: 5 } }, measure };
