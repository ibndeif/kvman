import { describe, expect, it } from 'vitest';
import { isTransient } from '../src/complete/failures.ts';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();
const hi = [userSays('hi')];

const failure = (status: number, message: string) => ({ status, body: { error: { message, type: 'server_error' } } });

describe('which provider failures may pass (07 §7.1, ADR 0009, 154)', () => {
  it('QA3-H21 a 5xx is transient, and a 400, a 401, or an unknown failure is not, and a 429 stays rate-limited', async () => {
    const { kernel, fake } = await kvai.start();
    const outcomes: unknown[] = [];
    for (const [status, message] of [[500, 'Internal fault.'], [502, 'Bad gateway'], [503, 'Service Unavailable'], [529, 'Overloaded'], [400, 'Bad request'], [401, 'Invalid key'], [404, 'No such model']] as const) {
      fake.reply(failure(status, message));
      const error: unknown = await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi }).catch((caught: unknown) => caught);
      outcomes.push([status, (error as { problem: { params: { transient: boolean } } }).problem.params.transient]);
    }
    expect(outcomes).toEqual([[500, true], [502, true], [503, true], [529, true], [400, false], [401, false], [404, false]]);
    fake.reply(failure(429, 'Rate limit reached.'));
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi })).rejects.toMatchObject({ problem: { code: 'kvai/RATE_LIMITED' } });
  });

  it('QA3-H21 timeouts, dropped connections, and DNS failures are transient by their text', () => {
    for (const reason of ['Request timed out.', 'Connection error.', 'fetch failed', 'read ECONNRESET', 'connect ETIMEDOUT 104.18.2.115:443', 'getaddrinfo ENOTFOUND openrouter.ai', 'getaddrinfo EAI_AGAIN openrouter.ai', 'socket hang up', 'The service is overloaded']) expect(isTransient(reason)).toBe(true);
    for (const reason of ['400: {"message":"Bad request"}', '401: Invalid key', 'The model does not support images.', '']) expect(isTransient(reason)).toBe(false);
  });

  it('QA10-H3 and QA10-E1 an HTTP 408, 409, or 425 is transient, other 4xx are not, and a status only counts at the start', () => {
    for (const reason of ['408: Request Timeout', '409: Conflict, try again', '425: Too Early']) expect(isTransient(reason), reason).toBe(true);
    for (const reason of ['400: Bad request', '401: Invalid key', '403: This model needs a confirmation', '404: No such model', '422: Unprocessable', 'The 408 widgets failed']) expect(isTransient(reason), reason).toBe(false);
  });
});
