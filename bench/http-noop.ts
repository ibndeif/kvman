import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startHttp, startKernel } from '../packages/kernel/src/index.ts';
import type { Benchmark } from './benchmarks.ts';
import { percentile, timedRuns, withBenchHome } from './measure.ts';

// A no-op command over HTTP: request → envelope → worker → envelope (plan 12 §12.3), on a kept-alive connection to
// kvman's own listener.

const noopEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerCommand('noop.run', { description: 'Does nothing.', input: z.object({}), output: z.object({}), public: true, handle: () => ({}) });
};
`;

// The extension is also the web home, which kvman's HTTP server needs to start.
function writeNoopExtension(folder: string): void {
  mkdirSync(path.join(folder, 'web'), { recursive: true });
  const manifest = { name: '@bench/noop', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'noop', source: 'index.ts', web: 'web' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), noopEntry);
}

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (root) => {
    const folder = path.join(root, 'noop');
    const homeFolder = path.join(root, 'home-folder');
    writeNoopExtension(folder);
    mkdirSync(homeFolder);
    const kernel = await startKernel({
      home: path.join(root, 'home'),
      homeFolder,
      preset: { name: 'bench', extensions: { '@bench/noop': `path:${folder}` }, settings: { 'kernel.workers': 1, 'kernel.web.home': 'noop' } },
      presetFolder: root,
      bundled: new Map(),
      mode: 'web',
      logLevel: 'error',
      terminalLog: false,
      startFolder: homeFolder,
      trust: () => Promise.resolve(true),
    });
    const http = await startHttp(kernel, { port: 0 });
    const call = async (): Promise<void> => {
      const response = await fetch(`http://127.0.0.1:${http.port}/api/commands/noop.run`, { method: 'POST', body: '{"input":{}}', headers: { 'content-type': 'application/json' } });
      await response.json();
    };
    try {
      await timedRuns(500, call);
      const durations = await timedRuns(5000, call);
      return { p50Ms: percentile(durations, 0.5), p99Ms: percentile(durations, 0.99) };
    } finally {
      const closing = http.close();
      await kernel.close();
      await closing;
    }
  });
}

export const httpNoop: Benchmark = { name: 'http.noop', targets: { p50Ms: { max: 5 }, p99Ms: { max: 20 } }, measure };
