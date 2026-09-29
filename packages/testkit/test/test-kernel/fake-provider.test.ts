import type { Json } from '@kvman/protocol';
import { createTestKernel, fakeProvider, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const thinker = new URL('./fixtures/extensions/thinker/extension.ts', import.meta.url);

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

function field(value: Json, name: string): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const found = value[name];
    if (found !== undefined) return found;
  }
  throw new Error(`expected ${name} in the reply`);
}

function itemsOf(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  throw new Error('expected an array in the reply');
}

describe('the fake provider (ADRs 0154, 0165)', { timeout: 60_000 }, () => {
  it('M2.13-E34 the fake provider answers from the descriptor options', async () => {
    const k = await started({ extensions: [thinker, fakeProvider({ reply: 'مرحبا', failures: 1 })] });
    await vi.waitFor(async () => {
      const models = itemsOf(await k.asUser().query('kernel.llm.models.list', { workspaceId: k.workspaceId }));
      expect(models.map((model) => field(model, 'id'))).toContain('fake-model');
    }, { timeout: 10_000 });
    expect(await k.asUser().command('thinker.ask', {})).toEqual({ content: 'مرحبا' });
    const completions = await k.asUser().query('kernel.messages.list', { type: 'kernel.llm.complete' });
    expect(itemsOf(field(completions, 'items')).map((item) => [field(item, 'state'), field(item, 'attempts')])).toEqual([['done', 1]]);
  });
});
