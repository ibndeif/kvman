import { describe, expect, it } from 'vitest';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const mebibyte = 1024 * 1024;

describe("kvai.complete's limits and retries (ADR 0003, 8 and 16)", () => {
  it('M2.1-E8 an input of 2 MiB runs, and one over 32 MiB fails TOO_LARGE', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({ chunks: [{ text: 'read it' }] });
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('x'.repeat(2 * mebibyte))] })).resolves.toMatchObject({ stopReason: 'stop' });
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('x'.repeat(33 * mebibyte))] })).rejects.toMatchObject({
      problem: { code: 'TOO_LARGE' },
    });
    expect(fake.requests()).toHaveLength(1);
  });

  it('M2.1-E9 an async call registers no retries, and pi-ai makes one request', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({ status: 500, body: { error: { message: 'Upstream fault.', type: 'server_error' } } });
    const jobId = await kernel.execAsync('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')] });
    const job = await kernel.waitForJob(jobId);
    expect(job).toMatchObject({ status: 'failed', attempts: 1, retries: 0, problem: { code: 'kvai/PROVIDER_ERROR' } });
    expect(fake.requests()).toHaveLength(1);
  });
});
