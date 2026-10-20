import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream, type ProviderStreams } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { callModel } from '../src/complete/model-call.ts';
import { stallAfterMs } from '../src/complete/stall-watch.ts';
import type { Target } from '../src/complete/target.ts';
import { credentialStore } from '../src/signin/credential-store.ts';
import { makeFakeClock, makeFakeSigninCtx, makeSharedSigninMaps, makeSigninModels, makeSigninOauth, untilSeen } from './support/fake-signin-ctx.ts';

// A silent stream (07 §7.1, ADR 0096). A test kernel runs kvai in a worker, out of reach of fake timers, so these tests
// call the model call itself with a fake context and a stream the test scripts: it sends what the test pushes, and
// ends `aborted` when its request's signal aborts, as pi-ai's providers do.

const provider = 'stall';
const fullId = `${provider}/m1`;
const answer: AssistantMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'hello' }],
  api: 'fake-chat',
  provider,
  model: 'm1',
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop',
  timestamp: 1,
};

function scripted() {
  let current: AssistantMessageEventStream | undefined;
  const open = (signal: AbortSignal | undefined): AssistantMessageEventStream => {
    const stream = createAssistantMessageEventStream();
    signal?.addEventListener('abort', () => stream.end({ ...answer, stopReason: 'aborted', errorMessage: 'Request was aborted' }), { once: true });
    current = stream;
    return stream;
  };
  const api: ProviderStreams = { stream: (_model, _context, options) => open(options?.signal), streamSimple: (_model, _context, options) => open(options?.signal) };
  const live = (): AssistantMessageEventStream => {
    if (current === undefined) throw new Error('no stream was opened');
    return current;
  };
  return { api, opened: () => current !== undefined, send: () => live().push({ type: 'start', partial: answer }), finish: () => live().end(answer) };
}

// The fake provider signs in, so the call has a stored sign-in that lasts past every test's clock.
async function call() {
  const fake = makeFakeSigninCtx('job-stall', makeSharedSigninMaps());
  const stream = scripted();
  const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), makeFakeClock().clock);
  const { models, model } = makeSigninModels(provider, makeSigninOauth(() => Promise.reject(new Error('never signs in'))), store, stream.api);
  const credential = { type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() + 24 * 3_600_000 };
  await fake.ctx.secrets.set(`${provider}.oauth`, JSON.stringify(credential));
  const target: Extract<Target, { kind: 'model' }> = { kind: 'model', models, model, provider, apiKey: undefined, signedIn: true, secrets: ['access', 'refresh'] };
  const done = callModel(fake.ctx as unknown as Ctx, fullId, target, { messages: [{ role: 'user', content: 'hi', timestamp: 1 }] });
  // The test reads the outcome after moving the clock; this keeps an early rejection from going unhandled.
  done.catch(() => undefined);
  // A wait that doesn't move the fake clock.
  await untilSeen(stream.opened, 'the stream opened');
  return { done, stream, cancel: () => fake.controller.abort() };
}

const stalled = { problem: { code: 'kvai/PROVIDER_ERROR', params: { model: fullId, reason: 'stream stalled', transient: true } } };
const settled = async (promise: Promise<unknown>): Promise<boolean> => Promise.race([promise.then(() => true, () => true), new Promise<boolean>((resolve) => setImmediate(() => resolve(false)))]);

describe('a silent stream is retried (ADR 0096)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('QA64-H1, QA64-E2, and QA64-E3 silence before the first event cuts the call at 300 s as a temporary failure', async () => {
    expect(stallAfterMs).toBe(300_000);
    const { done } = await call();
    await vi.advanceTimersByTimeAsync(299_999);
    expect(await settled(done)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(done).rejects.toMatchObject(stalled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('QA64-H2 and QA64-E2 silence after an event cuts the call 300 s after that event', async () => {
    const { done, stream } = await call();
    await vi.advanceTimersByTimeAsync(10_000);
    stream.send();
    await vi.advanceTimersByTimeAsync(299_999);
    expect(await settled(done)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(done).rejects.toMatchObject(stalled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('QA64-H3 and QA64-E2 a stream with an event every 299 s is never cut, and its answer returns', async () => {
    const { done, stream } = await call();
    for (let event = 0; event < 4; event += 1) {
      await vi.advanceTimersByTimeAsync(299_000);
      stream.send();
    }
    stream.finish();
    await expect(done).resolves.toMatchObject({ stopReason: 'stop', message: { content: [{ type: 'text', text: 'hello' }] } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('QA64-E1 a cancel at 100 s ends the call as a cancel, and nothing fires at 300 s', async () => {
    const { done, cancel } = await call();
    await vi.advanceTimersByTimeAsync(100_000);
    cancel();
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
