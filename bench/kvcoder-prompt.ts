import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestKernel } from '../packages/testkit/src/index.ts';
import type {} from '../extensions/kvcoder/src/index.ts';
import type { Benchmark } from './benchmarks.ts';
import { percentile, timedRuns, withBenchHome } from './measure.ts';

// M2.4-H14: kvcoder's prompt build with 10 sections (4 KB each) and 10 connectors, through `kvcoder.prompt.get` (plan 12 §12.3).

const extensions = fileURLToPath(new URL('../extensions/', import.meta.url));

const commands = Array.from({ length: 10 }, (_unused, index) => `tool${index}`);

const entry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
${commands.map((name) => `  ctx.registerCommand('bench.${name}.run', { description: 'Runs ${name}.', input: z.object({ value: z.string() }), output: z.object({}), public: true, handle: () => ({}) });`).join('\n')}
};
`;

function writeBenchExtension(folder: string): void {
  mkdirSync(folder);
  const manifest = { name: '@bench/tools', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'bench', source: 'index.ts' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), entry);
}

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (root) => {
    const folder = path.join(root, 'tools');
    writeBenchExtension(folder);
    const kernel = await createTestKernel({
      extensions: [path.join(extensions, 'kvai'), path.join(extensions, 'kvwebui'), path.join(extensions, 'kvcoder'), folder],
      settings: { 'kvwebui.home': 'kvcoder.chat' },
      logLevel: 'error',
    });
    try {
      const as = { as: '@bench/tools' };
      for (const [index, name] of commands.entries()) {
        await kernel.exec('kvcoder.connector.register', { name, description: `Tool number ${index}.`, commands: [{ name: 'run', command: `bench.${name}.run` }] }, as);
        await kernel.exec('kvcoder.section.set', { id: `section-${index}`, title: `Section ${index}`, order: index, content: 'x'.repeat(4096), ...(index % 2 === 0 ? { global: true } : {}) }, as);
      }
      const { id } = await kernel.exec('kvcoder.session.create', { title: 'Bench' });
      await timedRuns(50, () => kernel.exec('kvcoder.prompt.get', { sessionId: id }));
      const durations = await timedRuns(300, () => kernel.exec('kvcoder.prompt.get', { sessionId: id }));
      return { p99Ms: percentile(durations, 0.99) };
    } finally {
      await kernel.close();
    }
  });
}

export const kvcoderPrompt: Benchmark = { name: 'kvcoder.prompt', targets: { p99Ms: { max: 50 } }, measure };
