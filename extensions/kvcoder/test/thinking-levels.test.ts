import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

// ADR 0087, 11: a session's thinking level is always one its model has. `fake/m1` reasons (`off` to `high`), the
// built-in `openai-codex/gpt-6-luna` has all seven levels and `openai/gpt-6-luna` no `minimal`, and `fake/plain` doesn't think.

const kvcoder = useKvcoder();

const plain = { provider: 'fake', id: 'plain', name: 'Plain', reasoning: false, input: ['text' as const], contextWindow: 128_000, maxTokens: 8192 };
const levelOf = async (kernel: TestKernel, sessionId: string) => (await kernel.exec('kvcoder.session.get', { sessionId })).thinking;

async function configured(kernel: TestKernel, change: { model?: string; thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' }, sessionId?: string) {
  const id = sessionId ?? (await newSession(kernel));
  await kernel.exec('kvcoder.session.configure', { sessionId: id, ...change });
  return id;
}

describe("a session's thinking level (ADR 0087, 11)", { timeout: 30_000 }, () => {
  it('QA55-H12 xhigh is kept on a model that has it', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await configured(kernel, { model: 'openai-codex/gpt-6-luna', thinking: 'xhigh' });
    expect(await levelOf(kernel, sessionId)).toBe('xhigh');
  });

  it('QA55-E11 a model switch moves the level to the nearest the model has', async () => {
    const { kernel } = await kvcoder.start();
    await kernel.exec('kvai.model.add', plain);
    const minimal = await configured(kernel, { thinking: 'minimal' });
    await configured(kernel, { model: 'openai/gpt-6-luna' }, minimal);
    expect(await levelOf(kernel, minimal)).toBe('low');
    const extra = await configured(kernel, { model: 'openai-codex/gpt-6-luna', thinking: 'xhigh' });
    await configured(kernel, { model: 'fake/m1' }, extra);
    expect(await levelOf(kernel, extra)).toBe('high');
    const medium = await configured(kernel, { thinking: 'medium' });
    await configured(kernel, { model: 'fake/plain' }, medium);
    expect(await levelOf(kernel, medium)).toBe('off');
  });

  it('QA55-E12 a level the model lacks, set by hand, moves too', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await configured(kernel, { thinking: 'max' });
    expect(await levelOf(kernel, sessionId)).toBe('high');
  });

  it('QA55-E13 a new session and a helper start on a level their model has', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.thinking': 'xhigh', ...workers(worker('general', { model: 'fake/plain' })) } });
    await kernel.exec('kvai.model.add', plain);
    const sessionId = await newSession(kernel);
    expect(await levelOf(kernel, sessionId)).toBe('high');
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Do it' })), says('helped'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const helperId = /\(helper (\S+)\)$/.exec(toolResults(fake).at(-1) ?? '')?.[1] ?? '';
    expect(await levelOf(kernel, helperId)).toBe('off');
  });

  it('QA55-E14 a model kvai does not list leaves the level as it is', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await configured(kernel, { thinking: 'low' });
    await configured(kernel, { model: 'nowhere/model' }, sessionId);
    expect(await levelOf(kernel, sessionId)).toBe('low');
  });
});
