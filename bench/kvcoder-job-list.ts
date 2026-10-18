import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeOpenAI, type FakeReply } from '../packages/testkit/src/fake-openai.ts';
import { createTestKernel } from '../packages/testkit/src/index.ts';
import type {} from '../extensions/kvai/src/index.ts';
import type {} from '../extensions/kvcoder/src/index.ts';
import type { Benchmark } from './benchmarks.ts';
import { percentile, timedRuns, withBenchHome } from './measure.ts';

// QA56-H10: `kvcoder.job.list` for a chat with 20 ended background helpers, in a workspace whose other chat holds
// 5,000 messages of about 4 KB, near the size of the owner's (plan 12 §12.3, ADR 0088).

const extensions = fileURLToPath(new URL('../extensions/', import.meta.url));
const helpers = 20;
const fillerMessages = 5000;
const fillerText = 'x'.repeat(4096);

const delegations: FakeReply = {
  chunks: Array.from({ length: helpers }, (_unused, index) => ({
    toolCall: { id: `delegate-${index}`, name: 'run', arguments: { connector: 'delegate', command: 'run', payload: { worker: 'helper', title: `Helper ${index}`, task: 'Say done.', background: true } } },
  })),
};
// Every other model call (each helper's, and the lead's after it) says done; spares keep a late call from a retry.
const done: FakeReply = { chunks: [{ text: 'done' }] };

async function measure(): Promise<Record<string, number>> {
  const fake = await startFakeOpenAI();
  try {
    return await withBenchHome(async () => {
      const kernel = await createTestKernel({
        extensions: [path.join(extensions, 'kvai'), path.join(extensions, 'kvwebui'), path.join(extensions, 'kvcoder')],
        settings: {
          'kvwebui.home': 'kvcoder.chat',
          'kvai.defaultModel': 'fake/m1',
          'kvcoder.approval': 'auto',
          'kvcoder.delegate.workers': [{ name: 'helper', description: 'Says done.', enabled: true, kind: 'subagent', instructions: '', connectors: null, model: null, thinking: null }],
        },
        logLevel: 'error',
      });
      try {
        await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
        await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: false, contextWindow: 128_000, maxTokens: 8192 });
        const filler = await kernel.exec('kvcoder.session.create', { title: 'Filler' });
        for (let index = 0; index < fillerMessages; index += 1) await kernel.exec('kvcoder.note.add', { sessionId: filler.id, key: 'bench.note', params: { index, text: fillerText } });
        const { id } = await kernel.exec('kvcoder.session.create', { title: 'Bench' });
        fake.reply(delegations, ...Array.from({ length: helpers * 3 }, () => done));
        await kernel.exec('kvcoder.message.send', { sessionId: id, text: 'Start the helpers.' });
        await kernel.clock.advance(0);
        const rows = await kernel.exec('kvcoder.job.list', { sessionId: id });
        if (rows.length !== helpers || rows.some((row) => row.status !== 'succeeded')) throw new Error(`The bench chat has ${rows.length} jobs, not ${helpers} ended helpers.`);
        await timedRuns(10, () => kernel.exec('kvcoder.job.list', { sessionId: id }));
        const durations = await timedRuns(50, () => kernel.exec('kvcoder.job.list', { sessionId: id }));
        return { p50Ms: percentile(durations, 0.5) };
      } finally {
        await kernel.close();
      }
    });
  } finally {
    await fake.close();
  }
}

export const kvcoderJobList: Benchmark = { name: 'kvcoder.job.list', targets: { p50Ms: { max: 50 } }, measure };
