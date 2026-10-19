import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The fallback model (08 §8.1, ADR 0094, 4): a usage limit moves the chat to it, says so, and the step goes on.
const limit = { status: 403, body: { error: { message: 'The user has reached their usage limit.', type: 'invalid_request_error' } } };
const broken = { status: 400, body: { error: { message: 'Bad request.', type: 'invalid_request_error' } } };

async function world(fallback?: string) {
  const started = await kvcoder.start({ settings: fallback === undefined ? {} : { 'kvcoder.fallbackModel': fallback } });
  await started.kernel.exec('kvai.model.add', { provider: 'fake', id: 'm2', name: 'M2', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
  return started;
}

async function lastMessages(kernel: TestKernel, sessionId: string) {
  return (await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 })).messages.map((message) => (message.kind === 'notice' ? message.content : message.kind));
}

describe('the fallback model (ADR 0094, 4)', { timeout: 30_000 }, () => {
  it('QA62-H5 a usage limit moves the chat to the fallback, says so, and the answer comes from it', async () => {
    const { kernel, fake } = await world('fake/m2');
    const sessionId = await newSession(kernel);
    fake.reply(limit, says('answered by the fallback'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).model).toBe('fake/m2');
    expect(await lastMessages(kernel, sessionId)).toEqual(['user', { code: 'MODEL_SWITCHED', params: { from: 'fake/m1', to: 'fake/m2', code: 'kvai/USAGE_LIMIT' } }, 'assistant']);
    expect((fake.requests().at(-1)?.body as { model?: string }).model).toBe('m2');
  });

  it('QA62-E5 no setting, the same model, another failure, and a failing fallback end the turn as before', async () => {
    const cases: [string | undefined, unknown[], string][] = [
      [undefined, [limit], 'kvai/USAGE_LIMIT'],
      ['fake/m1', [limit], 'kvai/USAGE_LIMIT'],
      ['fake/m2', [broken], 'kvai/PROVIDER_ERROR'],
      ['fake/m2', [limit, limit], 'kvai/USAGE_LIMIT'],
    ];
    for (const [fallback, replies, code] of cases) {
      const { kernel, fake } = await world(fallback);
      const sessionId = await newSession(kernel);
      fake.reply(...(replies as Parameters<typeof fake.reply>));
      await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
      await kernel.clock.advance(0);
      const shown = await lastMessages(kernel, sessionId);
      expect(shown.at(-1), `${String(fallback)} ${code}`).toMatchObject({ code: 'STEP_FAILED', params: { code } });
      expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
    }
  });
});
