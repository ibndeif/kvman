import { createTestKernel, TestkitProblem, type TestKernel } from '@kvman/testkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extension = new URL('../src/extension.ts', import.meta.url);

let k: TestKernel;

beforeEach(async () => {
  k = await createTestKernel({ extensions: [extension] });
});

afterEach(async () => {
  await k.close();
});

describe('the sample prompt extension (05 §5.5, ADR 0167)', { timeout: 60_000 }, () => {
  it('M2.13-H1 is answered by the person and refuses an extension', async () => {
    const asked = k.command('confirm.ask', { topic: 'deploy', question: 'Deploy now?' });
    await vi.waitFor(() => expect(k.events('confirm.request.asked')).toHaveLength(1), { timeout: 10_000 });
    const [event] = k.events('confirm.request.asked');
    const payload = event?.payload;
    const requestId = typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? String(payload['requestId']) : '';

    const refused = await k.command('confirm.request.answer', { requestId, approved: true }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TestkitProblem);
    expect(refused).toMatchObject({ problem: { code: 'CAPABILITY_DENIED' } });

    expect(await k.asUser().command('confirm.request.answer', { requestId, approved: true })).toEqual({});
    expect(await asked).toEqual({ approved: true });
    expect(await k.query('confirm.requests.list', {})).toMatchObject({ items: [{ id: requestId, status: 'answered', answer: { approved: true } }] });
    expect(k.events('confirm.request.closed').map((closed) => closed.payload)).toEqual([{ requestId, status: 'answered' }]);
  });
});
