import { describe, expect, it } from 'vitest';
import { useKvai, userSays } from './support/kvai-kernel.ts';
import { streamOptions } from '../src/complete/stream-options.ts';

// ADR 0087, 4: `kvai.complete` takes how long the provider keeps the prompt's cache and passes it to pi-ai.

const kvai = useKvai();

describe('cacheRetention (ADR 0087, 4)', () => {
  it('QA55-H7 a named retention reaches pi-ai, and none is sent when it is left out', () => {
    const signal = new AbortController().signal;
    expect(streamOptions(signal, { messages: [userSays('hi')], cacheRetention: 'long' }, undefined)).toMatchObject({ cacheRetention: 'long' });
    expect(streamOptions(signal, { messages: [userSays('hi')], cacheRetention: 'short' }, undefined)).toMatchObject({ cacheRetention: 'short' });
    expect(streamOptions(signal, { messages: [userSays('hi')] }, undefined)).not.toHaveProperty('cacheRetention');
  });

  it('QA55-H7 a call with the long retention is answered', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({ chunks: [{ text: 'fine' }] });
    const answer = await kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')], sessionId: 'chat-1', cacheRetention: 'long' });
    expect(answer.stopReason).toBe('stop');
  });

  it('QA55-E10 an unknown retention fails VALIDATION_FAILED', async () => {
    const { kernel, fake } = await kvai.start();
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')], cacheRetention: 'forever' as 'long' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(fake.requests()).toHaveLength(0);
  });
});
