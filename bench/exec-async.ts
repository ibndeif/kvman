import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createTestKernel } from '../packages/testkit/src/index.ts';
import type { Benchmark } from './benchmarks.ts';
import { withBenchHome } from './measure.ts';

// Queued no-op commands per second, from queueing to their rows ending (plan 12 §12.3). The test kernel's home goes
// under the bench folder, on the disk, so each commit pays its fsync.

const jobCount = 2000;

const noopEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerCommand('noop.run', { description: 'Does nothing.', input: z.object({}), output: z.object({}), public: true, handle: () => ({}) });
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
    process.env['TMPDIR'] = root;
    const kernel = await createTestKernel({ extensions: [folder], logLevel: 'error', settings: { 'kernel.workers': 3 } });
    try {
      const start = performance.now();
      const ids = await Promise.all(Array.from({ length: jobCount }, () => kernel.execAsync('noop.run', {})));
      await Promise.all(ids.map((id) => kernel.waitForJob(id)));
      return { perSecond: jobCount / ((performance.now() - start) / 1000) };
    } finally {
      await kernel.close();
    }
  });
}

export const execAsyncThroughput: Benchmark = { name: 'exec-async.noop', targets: { perSecond: { min: 500 } }, measure };
