import { describe, expect, it } from 'vitest';
import type { OAuthCredential } from '@earendil-works/pi-ai';
import { type ProblemError } from '@kvman/sdk';
import { credentialStore } from '../../src/signin/credential-store.ts';
import { answerSignin } from '../../src/signin/register-signin.ts';
import { runSignin } from '../../src/signin/signin-run.ts';
import { makeFakeClock, makeFakeSigninCtx, makeSharedSigninMaps, makeSigninModels, makeSigninOauth, untilSeen } from '../support/fake-signin-ctx.ts';

const provider = 'plan-fake';

const oauthOf = (access: string, refresh: string): OAuthCredential => ({ type: 'oauth', access, refresh, expires: 2_000_000_000 });

describe('plan sign-in runs (07 §7.2, ADR 0009, 230–233)', () => {
  it('QA15-H5 a browser sign-in saves the credential', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-h5', shared);
    const credential = oauthOf('access-h5', 'refresh-h5');
    const oauth = makeSigninOauth(async (interaction) => {
      interaction.notify({ type: 'auth_url', url: 'https://127.0.0.1:1455/start' });
      return credential;
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    await fake.ctx.secrets.set(`${provider}.apiKey`, 'old-key-h5');
    await expect(runSignin(fake.ctx, models, provider, clock)).resolves.toEqual({});
    expect(fake.chunks).toEqual([{ type: 'auth_url', url: 'https://127.0.0.1:1455/start' }]);
    expect(JSON.parse(await fake.ctx.secrets.get(`${provider}.oauth`) ?? 'missing')).toEqual(credential);
    expect(await fake.ctx.secrets.get(`${provider}.apiKey`)).toBeUndefined();
  });

  it('QA15-H6 a device-code sign-in streams the code', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-h6', shared);
    const credential = oauthOf('access-h6', 'refresh-h6');
    const oauth = makeSigninOauth(async (interaction) => {
      interaction.notify({ type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://127.0.0.1:1455/code', expiresInSeconds: 300 });
      interaction.notify({ type: 'progress', message: 'waiting for the browser' });
      interaction.notify({ type: 'progress', message: 'still waiting' });
      return credential;
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    await expect(runSignin(fake.ctx, models, provider, clock)).resolves.toEqual({});
    expect(fake.chunks).toEqual([
      { type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://127.0.0.1:1455/code', expiresInSeconds: 300 },
      { type: 'progress' },
      { type: 'progress' },
    ]);
    expect(JSON.parse(await fake.ctx.secrets.get(`${provider}.oauth`) ?? 'missing')).toEqual(credential);
  });

  it('QA15-E8 a secret prompt fails', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e8', shared);
    const oauth = makeSigninOauth(async (interaction) => {
      await interaction.prompt({ type: 'secret', message: 'Password?', placeholder: 'secret' });
      return oauthOf('access-e8', 'refresh-e8');
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    await expect(runSignin(fake.ctx, models, provider, clock)).rejects.toMatchObject({
      problem: { code: 'kvai/SIGNIN_FAILED', params: { provider, reason: 'a secret prompt is not supported' } },
    });
    expect(await fake.ctx.secrets.get(`${provider}.oauth`)).toBeUndefined();
  });

  it('QA15-E9 a failed login says why and holds no token', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e9', shared);
    const answer = 'pasted-answer-9';
    const oldKey = 'old-key-9-abc';
    const oldCredential = oauthOf('old-access-9-abc', 'old-refresh-9-abc');
    await fake.ctx.secrets.set(`${provider}.apiKey`, oldKey);
    await fake.ctx.secrets.set(`${provider}.oauth`, JSON.stringify(oldCredential));
    const oauth = makeSigninOauth(async (interaction) => {
      const given = await interaction.prompt({ type: 'text', message: 'Paste the redirect URL' });
      throw new Error(`login failed for ${given} with key ${oldKey} and tokens old-access-9-abc and old-refresh-9-abc: ${'x'.repeat(1200)}`);
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    const run = runSignin(fake.ctx, models, provider, clock);
    await untilSeen(() => fake.chunks.some((chunk) => JSON.stringify(chunk).includes('"kind":"text"')), 'text prompt');
    await answerSignin(fake.ctx, provider, answer);
    const failure = await run.then(
      () => {
        throw new Error('the sign-in should have failed');
      },
      (error: unknown): unknown => error,
    );
    expect(failure).toMatchObject({ problem: { code: 'kvai/SIGNIN_FAILED', params: { provider } } });
    const reason = (failure as ProblemError).problem.params?.['reason'];
    if (typeof reason !== 'string') throw new Error('the failure has no reason text');
    expect(reason).toHaveLength(1000);
    expect(reason).toContain('[secret]');
    expect(reason).not.toContain(answer);
    expect(reason).not.toContain(oldKey);
    expect(reason).not.toContain('old-access-9-abc');
    expect(reason).not.toContain('old-refresh-9-abc');
    expect(await fake.ctx.secrets.get(`${provider}.oauth`)).toBe(JSON.stringify(oldCredential));
    expect(await fake.ctx.secrets.get(`${provider}.apiKey`)).toBe(oldKey);
  });

  it('QA15-E10 the listener stays on loopback', async () => {
    const realHost = process.env['PI_OAUTH_CALLBACK_HOST'];
    try {
      for (const host of ['0.0.0.0', '192.168.1.5']) {
        process.env['PI_OAUTH_CALLBACK_HOST'] = host;
        const shared = makeSharedSigninMaps();
        const { clock } = makeFakeClock();
        const fake = makeFakeSigninCtx(`job-e10-${host}`, shared);
        let called = false;
        const oauth = makeSigninOauth(async () => {
          called = true;
          return oauthOf('access-e10', 'refresh-e10');
        });
        const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
        const { models } = makeSigninModels(provider, oauth, store);
        await expect(runSignin(fake.ctx, models, provider, clock)).rejects.toMatchObject({
          problem: { code: 'kvai/SIGNIN_FAILED', params: { provider, reason: 'callback host' } },
        });
        expect(called).toBe(false);
      }
      for (const host of ['127.0.0.1', 'localhost', '::1', undefined]) {
        if (host === undefined) delete process.env['PI_OAUTH_CALLBACK_HOST'];
        else process.env['PI_OAUTH_CALLBACK_HOST'] = host;
        const shared = makeSharedSigninMaps();
        const { clock } = makeFakeClock();
        const fake = makeFakeSigninCtx(`job-e10-ok-${host ?? 'unset'}`, shared);
        let called = false;
        const oauth = makeSigninOauth(async () => {
          called = true;
          return oauthOf('access-e10', 'refresh-e10');
        });
        const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
        const { models } = makeSigninModels(provider, oauth, store);
        await expect(runSignin(fake.ctx, models, provider, clock)).resolves.toEqual({});
        expect(called).toBe(true);
      }
    } finally {
      if (realHost === undefined) delete process.env['PI_OAUTH_CALLBACK_HOST'];
      else process.env['PI_OAUTH_CALLBACK_HOST'] = realHost;
    }
  });

  it('QA15-E11 the device id is made once', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const first = makeFakeSigninCtx('job-e11a', shared);
    const second = makeFakeSigninCtx('job-e11b', shared);
    const devices: string[] = [];
    const oauth = makeSigninOauth(async (_interaction, options) => {
      devices.push(options?.getDeviceId?.() ?? 'missing');
      return oauthOf('access-e11', 'refresh-e11');
    });
    const store = credentialStore(first.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    await expect(runSignin(first.ctx, models, provider, clock)).resolves.toEqual({});
    await expect(runSignin(second.ctx, models, provider, clock)).resolves.toEqual({});
    const [made, reused] = devices;
    if (made === undefined || reused === undefined) throw new Error('the logins did not run');
    expect(reused).toBe(made);
    expect(made).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(shared.kv.get('deviceId')).toBe(made);
  });
});
