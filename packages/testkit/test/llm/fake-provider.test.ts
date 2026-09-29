import { recordExtension } from '@kvman/kernel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProviderExtension } from '../../src/fake-provider-extension.ts';
import { workspaceA } from '../hosts/harness.ts';
import { person, sendAs, type InstallFixture } from '../install/harness.ts';
import { enable, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, openLlmFixture, refreshWait, waitForFakeModel } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

function recordedLlm(definition: ReturnType<typeof fakeProviderExtension>): { providers: unknown; models: unknown } {
  const { manifest } = recordExtension(definition, { packageName: '@kvman/fake-provider', version: '1.0.0', correlationId });
  return { providers: manifest.llm.providers, models: manifest.llm.models };
}

async function enabledAsker(): Promise<InstallFixture> {
  const current = fixture as InstallFixture;
  valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
  valueOf(await enable(current, workspaceA, '@acme/asker'));
  await waitForFakeModel(current);
  return current;
}

async function ask(model: { provider: string; id: string }): Promise<string> {
  const current = fixture as InstallFixture;
  return sendAs(current, person, 'asker.ask', { purpose: 'chat', model, live: { text: 'asker.tokens.generated:s1' } }, workspaceA);
}

function textsOf(run: string): unknown[] {
  const current = fixture as InstallFixture;
  return current.live.filter((frame) => frame.run === run && frame.type === 'asker.tokens.generated').map((frame) => frame.chunk);
}

describe('fake provider (ADR 0154)', llmTests, () => {
  it('M2.9-E6 recording and running the fake answers the scripted reply, deltas, usage, and cost', async () => {
    expect(recordedLlm(fakeProviderExtension())).toEqual({
      providers: [{
        id: 'fake',
        title: 'Fake',
        description: 'Scripted answers for tests.',
        auth: 'none',
        functions: ['provider:fake.complete', 'provider:fake.status'],
      }],
      models: [{
        id: 'fake-model',
        provider: 'fake',
        title: 'Fake model',
        description: "The fake provider's only model.",
        contextWindow: 100_000,
        maxOutput: 10_000,
        cost: { inputPerMTok: 1, outputPerMTok: 2 },
        capabilities: { tools: true, vision: true, thinking: ['low', 'medium', 'high'] },
      }],
    });

    fixture = await openLlmFixture();
    await installFakeProvider(fixture, {});
    const current = await enabledAsker();
    const asked = await ask({ provider: 'fake', id: 'fake-model' });
    const reply = await current.runtime.awaitReply(asked);
    expect(reply).toEqual({
      ok: true,
      value: {
        content: 'ok',
        usage: { input: 10, output: 5 },
        model: { provider: 'fake', id: 'fake-model' },
        stopReason: 'end',
      },
    });
    expect(textsOf(asked)).toEqual([{ text: 'ok' }]);
    const [usage] = rows(current, 'SELECT input, output, cost_usd FROM llm_usage');
    expect(usage).toMatchObject({ input: 10, output: 5 });
    expect(Number(usage?.['cost_usd'])).toBeCloseTo(0.00002, 10);
    await fixture.close();

    expect(recordedLlm(fakeProviderExtension({ reply: 'hi', chunks: ['h', 'i'], failures: 1, usage: { input: 3, output: 4 }, costUsd: 0.1 })).models)
      .toHaveLength(1);
    fixture = await openLlmFixture();
    await installFakeProvider(fixture, { reply: 'hi', chunks: ['h', 'i'], failures: 1, usage: { input: 3, output: 4 }, costUsd: 0.1 });
    const second = await enabledAsker();
    const retrying = await ask({ provider: 'fake', id: 'fake-model' });
    await vi.waitFor(() => {
      expect(rows(second, "SELECT state, attempts FROM messages WHERE type = 'kernel.llm.complete'")).toEqual([{ state: 'pending', attempts: 1 }]);
    }, refreshWait);
    second.timers.advance(1_000);
    expect(await second.runtime.awaitReply(retrying)).toEqual({
      ok: true,
      value: {
        content: 'hi',
        usage: { input: 3, output: 4 },
        costUsd: 0.1,
        model: { provider: 'fake', id: 'fake-model' },
        stopReason: 'end',
      },
    });
    expect(textsOf(retrying)).toEqual([{ text: 'h' }, { text: 'i' }]);
    expect(rows(second, 'SELECT input, output, cost_usd FROM llm_usage')).toEqual([{ input: 3, output: 4, cost_usd: 0.1 }]);
  });
});
