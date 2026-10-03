import { describe, expect, it } from 'vitest';
import type { Credential, OAuthCredential } from '@earendil-works/pi-ai';
import { credentialStore } from '../../src/signin/credential-store.ts';
import { makeFakeClock, makeFakeSigninCtx, makeSharedSigninMaps, untilSeen } from '../support/fake-signin-ctx.ts';

const provider = 'plan-store';

const oauthOf = (access: string, refresh: string): OAuthCredential => ({ type: 'oauth', access, refresh, expires: 2_000_000_000 });

describe("the credential store's lease and shape (07 §7.2, ADR 0009, 234)", () => {
  it('QA15-E15 refreshes take turns', async () => {
    const shared = makeSharedSigninMaps();
    const { clock, current } = makeFakeClock();
    const first = makeFakeSigninCtx('job-e15-first', shared);
    const second = makeFakeSigninCtx('job-e15-second', shared);
    const credential = oauthOf('access-e15', 'refresh-e15');
    const seen: (Credential | undefined)[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const store = credentialStore(first.ctx, () => Promise.resolve([provider]), clock);
    const next = credentialStore(second.ctx, () => Promise.resolve([provider]), clock);
    const firstRun = store.modify(provider, async (currentCredential) => {
      seen.push(currentCredential);
      await gate;
      return credential;
    });
    await untilSeen(() => shared.kv.has(`lease/${provider}`), 'the first lease');
    const secondRun = next.modify(provider, async (currentCredential) => {
      seen.push(currentCredential);
      return undefined;
    });
    releaseFirst();
    await expect(firstRun).resolves.toEqual(credential);
    await expect(secondRun).resolves.toEqual(credential);
    expect(seen).toEqual([undefined, credential]);
    expect(shared.kv.get(`lease/${provider}`)).toBeUndefined();
    expect(await first.ctx.secrets.get(`${provider}.oauth`)).toBe(JSON.stringify(credential));

    shared.kv.set(`lease/${provider}`, { holder: 'someone-else', expiresAt: current() - 1 });
    const taking = makeFakeSigninCtx('job-e15-takeover', shared);
    const takingStore = credentialStore(taking.ctx, () => Promise.resolve([provider]), clock);
    await expect(takingStore.modify(provider, async () => credential)).resolves.toEqual(credential);
    expect(shared.kv.get(`lease/${provider}`)).toBeUndefined();

    shared.kv.set(`lease/${provider}`, { holder: 'stuck-holder', expiresAt: current() + 1_000_000 });
    const waiting = makeFakeSigninCtx('job-e15-wait', shared);
    const waitingStore = credentialStore(waiting.ctx, () => Promise.resolve([provider]), clock);
    await expect(waitingStore.modify(provider, async () => credential)).rejects.toMatchObject({
      problem: { code: 'kvai/PROVIDER_ERROR', params: { provider, reason: 'timed out waiting for another refresh of the sign-in', transient: true } },
    });

    const cancelling = makeFakeSigninCtx('job-e15-cancel', shared);
    const cancellingStore = credentialStore(cancelling.ctx, () => Promise.resolve([provider]), clock);
    const cancelled = cancellingStore.modify(provider, async () => credential);
    await new Promise<void>((resolve) => setImmediate(resolve));
    cancelling.controller.abort();
    await expect(cancelled).rejects.toBe(cancelling.controller.signal.reason);
    expect(shared.kv.get(`lease/${provider}`)).toMatchObject({ holder: 'stuck-holder' });

    shared.kv.delete(`lease/${provider}`);
    const failing = makeFakeSigninCtx('job-e15-fail', shared);
    const failingStore = credentialStore(failing.ctx, () => Promise.resolve([provider]), clock);
    await expect(
      failingStore.modify(provider, async () => {
        throw new Error('boom-e15');
      }),
    ).rejects.toThrow('boom-e15');
    expect(shared.kv.get(`lease/${provider}`)).toBeUndefined();
  });

  it('QA15-E16 the credential store is exact', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e16', shared);
    const credential = oauthOf('access-e16-concealed', 'refresh-e16-concealed');
    const store = credentialStore(fake.ctx, () => Promise.resolve(['plan-a', 'plan-b']), clock);
    await expect(store.read('plan-a')).resolves.toBeUndefined();
    await fake.ctx.secrets.set('plan-a.oauth', JSON.stringify(credential));
    await expect(store.read('plan-a')).resolves.toEqual(credential);
    expect(await store.list()).toEqual([{ providerId: 'plan-a', type: 'oauth' }]);
    expect(JSON.stringify(await store.list())).not.toContain('access-e16-concealed');
    await expect(store.delete('plan-a')).resolves.toBeUndefined();
    await expect(store.read('plan-a')).resolves.toBeUndefined();
    await expect(store.delete('plan-a')).resolves.toBeUndefined();
    await expect(store.modify('plan-b', async () => credential)).resolves.toEqual(credential);
    await expect(store.read('plan-b')).resolves.toEqual(credential);
  });
});
