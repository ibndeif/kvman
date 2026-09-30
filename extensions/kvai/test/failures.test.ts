import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const hi = [userSays('hi')];
const ok = { chunks: [{ text: 'ok' }] };

function failsWith(code: string, params?: Record<string, unknown>): object {
  return { problem: params === undefined ? { code } : { code, params } };
}

describe('kvai.complete failures (07 §7.1)', () => {
  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('M2.1-H2 a missing key, a missing model, an unknown model, a 429, and an over-long context fail with their codes', async () => {
    const { kernel, fake } = await kvai.start();
    await expect(kernel.exec('kvai.complete', { model: 'anthropic/claude-sonnet-5-5', messages: hi })).rejects.toMatchObject(failsWith('kvai/KEY_MISSING', { provider: 'anthropic' }));
    await expect(kernel.exec('kvai.complete', { messages: hi })).rejects.toMatchObject(failsWith('kvai/NO_MODEL'));
    await expect(kernel.exec('kvai.complete', { model: 'fake/nope', messages: hi })).rejects.toMatchObject(failsWith('kvai/MODEL_UNKNOWN', { model: 'fake/nope' }));
    await expect(kernel.exec('kvai.complete', { model: 'nowhere/m', messages: hi })).rejects.toMatchObject(failsWith('kvai/MODEL_UNKNOWN', { model: 'nowhere/m' }));
    await expect(kernel.exec('kvai.complete', { model: 'no-slash', messages: hi })).rejects.toMatchObject(failsWith('kvai/MODEL_UNKNOWN', { model: 'no-slash' }));
    fake.reply({ status: 429, body: { error: { message: 'Rate limit reached.', type: 'rate_limit_error' } } });
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi })).rejects.toMatchObject(failsWith('kvai/RATE_LIMITED', { model: 'fake/m1' }));
    const tooLong = "This model's maximum context length is 128000 tokens. However, your messages resulted in 200000 tokens.";
    fake.reply({ status: 400, body: { error: { message: tooLong, type: 'invalid_request_error' } } });
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi })).rejects.toMatchObject(failsWith('kvai/CONTEXT_TOO_LONG', { model: 'fake/m1' }));
    expect(fake.requests()).toHaveLength(2);
  });

  it('M2.1-E10 a key in the environment is never read', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-from-the-environment';
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.complete', { model: 'anthropic/claude-sonnet-5-5', messages: hi })).rejects.toMatchObject(failsWith('kvai/KEY_MISSING', { provider: 'anthropic' }));
  });

  it('M2.1-E11 a custom provider sends its key when set, and the placeholder none otherwise', async () => {
    const keyless = await kvai.start();
    keyless.fake.reply(ok);
    await keyless.kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi });
    expect(keyless.fake.requests()[0]?.authorization).toBe('Bearer none');
    const keyed = await kvai.start({ secrets: { '@kvman/kvai': { 'fake.apiKey': 'sk-fake-123' } } });
    keyed.fake.reply(ok);
    await keyed.kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi });
    expect(keyed.fake.requests()[0]?.authorization).toBe('Bearer sk-fake-123');
  });

  it('M2.1-E12 a provider error gives its reason with the key hidden, and logs neither', async () => {
    const { kernel, fake } = await kvai.start({ secrets: { '@kvman/kvai': { 'fake.apiKey': 'sk-fake-123' } } });
    fake.reply({ status: 500, body: { error: { message: 'The key sk-fake-123 hit an internal fault.', type: 'server_error' } } });
    const failure: unknown = await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi }).catch((error: unknown) => error);
    expect(failure).toMatchObject(failsWith('kvai/PROVIDER_ERROR', { model: 'fake/m1', reason: expect.stringContaining('The key [secret] hit an internal fault.') }));
    expect(JSON.stringify(failure)).not.toContain('sk-fake-123');
    const log = readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8');
    expect(log).not.toContain('sk-fake-123');
    expect(log).not.toContain('internal fault');
  });
});
