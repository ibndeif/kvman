import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvai } from '../support/kvai-kernel.ts';

const kvai = useKvai();

const problem = (code: string, params?: Record<string, unknown>) => ({ problem: params === undefined ? { code } : { code, params } });

describe('the sign-in commands in the kernel (07 §7.2, ADR 0009, 230–232)', () => {
  it('QA15-H9 the sign-in commands are in the kernel', async () => {
    const { kernel } = await kvai.start();
    const entry = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    if (entry === undefined) throw new Error('kvai is not loaded');
    for (const name of ['kvai.provider.disconnect', 'kvai.provider.signin.start', 'kvai.provider.signin.answer', 'kvai.provider.signin.cancel']) {
      expect(entry.commands.find((command) => command.name === name)).toMatchObject({ name, public: true });
    }
    const jobId = await kernel.execAsync('kvai.provider.signin.start', { provider: 'google' });
    const job = await kernel.waitForJob(jobId);
    expect(job).toMatchObject({
      status: 'failed',
      attempts: 1,
      retries: 0,
      problem: { code: 'kvai/SIGNIN_UNSUPPORTED', params: { provider: 'google' } },
    });
  });

  it('QA15-E1 unknown providers', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.signin.start', { provider: 'nowhere' })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));
    await expect(kernel.exec('kvai.provider.signin.answer', { provider: 'nowhere', answer: 'x' })).rejects.toMatchObject(
      problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }),
    );
    await expect(kernel.exec('kvai.provider.signin.cancel', { provider: 'nowhere' })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));
  });

  it('QA15-E4 no sign-in, no start', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.signin.start', { provider: 'fake' })).rejects.toMatchObject(problem('kvai/SIGNIN_UNSUPPORTED', { provider: 'fake' }));
    await expect(kernel.exec('kvai.provider.signin.start', { provider: 'google' })).rejects.toMatchObject(problem('kvai/SIGNIN_UNSUPPORTED', { provider: 'google' }));
  });

  it('QA15-E5 an answer needs a waiting sign-in', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.signin.answer', { provider: 'anthropic', answer: 'pasted' })).rejects.toMatchObject(
      problem('kvai/SIGNIN_NOT_WAITING', { provider: 'anthropic' }),
    );
    expect(await kernel.exec('kernel.secrets.list', {})).not.toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.signinAnswer' });
  });

  it('QA15-E6 an answer never reaches the database or the log', async () => {
    const { kernel } = await kvai.start();
    const answer = 'https://localhost:1455/auth/callback?code=sekrit-1a2b3c';
    await expect(kernel.execAsync('kvai.provider.signin.answer', { provider: 'anthropic', answer })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    expect(JSON.stringify(await kernel.exec('kernel.jobs.list', { limit: 1000 }))).not.toContain('sekrit-1a2b3c');
    expect(JSON.stringify(await kernel.exec('kernel.secrets.list', {}))).not.toContain('sekrit-1a2b3c');
    expect(readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')).not.toContain('sekrit-1a2b3c');
  });
});
