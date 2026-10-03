import { describe, expect, it } from 'vitest';
import { createAssistantMessageEventStream, ModelsError, type AssistantMessage, type AssistantMessageEventStream, type OAuthCredential, type ProviderStreams, type SimpleStreamOptions } from '@earendil-works/pi-ai';import type { Ctx } from '@kvman/sdk';
import { builtinCatalog } from '../../src/catalog/builtin-catalog.ts';
import type { CustomCatalog } from '../../src/catalog/custom-catalog.ts';
import { callModel } from '../../src/complete/model-call.ts';
import { authorizeSignin } from '../../src/complete/signin-auth.ts';
import type { Target } from '../../src/complete/target.ts';
import { resolveTarget } from '../../src/complete/target.ts';
import { credentialStore, readOauthCredential } from '../../src/signin/credential-store.ts';
import { makeFakeClock, makeFakeSigninCtx, makeSharedSigninMaps, makeSigninModels, makeSigninOauth, noAmbientAuth } from '../support/fake-signin-ctx.ts';
import { useKvai } from '../support/kvai-kernel.ts';

const kvai = useKvai();
const provider = 'plan-call';
let refreshCalls = 0;

const emptyCatalog: CustomCatalog = {
  providers: () => Promise.resolve([]),
  provider: () => Promise.resolve(undefined),
  putProvider: () => Promise.resolve(),
  removeProvider: () => Promise.resolve(),
  models: () => Promise.resolve([]),
  model: () => Promise.resolve(undefined),
  putModel: () => Promise.resolve(),
  removeModel: () => Promise.resolve(),
};

const endWith = (answer: AssistantMessage): AssistantMessageEventStream => {
  const stream = createAssistantMessageEventStream();
  stream.end(answer);
  return stream;
};

function scriptedApi(seen: (SimpleStreamOptions | undefined)[], answer: AssistantMessage): ProviderStreams {
  return {
    stream: () => endWith(answer),
    streamSimple: (_model, _context, options) => {
      seen.push(options);
      return endWith(answer);
    },
  };
}

const scriptedUsage = { input: 3, output: 5, cacheRead: 7, cacheWrite: 11, totalTokens: 22, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 } };

const okMessage: AssistantMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'hello' }],
  api: 'fake-chat',
  provider,
  model: 'm1',
  usage: scriptedUsage,
  stopReason: 'stop',
  timestamp: 1,
};

const oauthOf = (access: string, refresh: string, expires: number): OAuthCredential => ({ type: 'oauth', access, refresh, expires });

describe('a call with a sign-in (07 §7.2, ADR 0009, 235)', () => {
  it('QA15-H8 a call uses the sign-in', async () => {
    const shared = makeSharedSigninMaps();
    const fake = makeFakeSigninCtx('job-h8', shared);
    const stored = oauthOf('access-h8', 'refresh-h8', Date.now() + 3_600_000);
    await fake.ctx.secrets.set('anthropic.oauth', JSON.stringify(stored));
    const resolved = await resolveTarget(fake.ctx as unknown as Ctx, emptyCatalog, 'anthropic/claude-sonnet-5-5');
    if (resolved.kind !== 'model') throw new Error('expected a model target');
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.apiKey).toBeUndefined();
    expect(resolved.signedIn).toBe(true);
    expect(resolved.secrets).toEqual(['access-h8', 'refresh-h8']);

    const fresh = async (credential: OAuthCredential, refresh: (credential: OAuthCredential) => Promise<OAuthCredential>) => {
      const own = makeSharedSigninMaps();
      const ticking = makeFakeClock();
      const ctx = makeFakeSigninCtx(`job-h8-${credential.access}`, own);
      const seen: (SimpleStreamOptions | undefined)[] = [];
      let refreshCalls = 0;
      const oauth = makeSigninOauth(
        async () => oauthOf('unused', 'unused', 0),
        async (current) => {
          refreshCalls += 1;
          return refresh(current);
        },
      );
      const store = credentialStore(ctx.ctx, () => Promise.resolve([provider]), ticking.clock);
      const { models, model } = makeSigninModels(provider, oauth, store, scriptedApi(seen, okMessage));
      const boundary: (SimpleStreamOptions | undefined)[] = [];
      const innerStreamSimple = models.streamSimple.bind(models);
      models.streamSimple = (streamModel, context, options) => {
        boundary.push(options);
        return innerStreamSimple(streamModel, context, options);
      };
      await ctx.ctx.secrets.set(`${provider}.oauth`, JSON.stringify(credential));
      const target: Extract<Target, { kind: 'model' }> = { kind: 'model', models, model, provider, apiKey: undefined, signedIn: true, secrets: [credential.access, credential.refresh] };
      const output = await callModel(ctx.ctx as unknown as Ctx, `${provider}/m1`, target, { messages: [{ role: 'user', content: 'hi', timestamp: 1 }] });
      return { ctx, seen, boundary, refreshCalls, output };
    };

    const unexpired = await fresh(oauthOf('access-h8-call', 'refresh-h8-call', Date.now() + 3_600_000), async (current) => current);
    expect(unexpired.output).toEqual({ message: okMessage, stopReason: 'stop', usage: { input: 3, output: 5, cacheRead: 7, cacheWrite: 11, cost: 0.5 } });
    expect(unexpired.refreshCalls).toBe(0);
    expect(unexpired.seen).toHaveLength(1);
    expect(unexpired.boundary).toHaveLength(1);
    const options = unexpired.boundary[0];
    if (options === undefined) throw new Error('the call was not streamed');
    expect('apiKey' in options).toBe(false);

    const rotated = oauthOf('access-h8-new', 'refresh-h8-new', Date.now() + 3_600_000);
    const expiring = await fresh(oauthOf('access-h8-old', 'refresh-h8-old', Date.now() + 60_000), async () => rotated);
    expect(expiring.output).toMatchObject({ stopReason: 'stop' });
    expect(expiring.refreshCalls).toBe(1);
    expect(JSON.parse(await expiring.ctx.ctx.secrets.get(`${provider}.oauth`) ?? 'missing')).toEqual(rotated);
  });

  it('QA15-E13 a rejected refresh fails kvai/SIGNIN_EXPIRED', async () => {
    const refreshing = async (refresh: (credential: OAuthCredential) => Promise<OAuthCredential>) => {
      const shared = makeSharedSigninMaps();
      const { clock } = makeFakeClock();
      const fake = makeFakeSigninCtx(`job-e13-${refreshCalls++}`, shared);
      const expiring = oauthOf('access-e13', 'refresh-e13', Date.now() + 60_000);
      const oauth = makeSigninOauth(
        async () => oauthOf('unused', 'unused', 0),
        async (current) => refresh(current),
      );
      const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
      const { models, model } = makeSigninModels(provider, oauth, store, scriptedApi([], okMessage));
      await fake.ctx.secrets.set(`${provider}.oauth`, JSON.stringify(expiring));
      const target: Extract<Target, { kind: 'model' }> = { kind: 'model', models, model, provider, apiKey: undefined, signedIn: true, secrets: [expiring.access, expiring.refresh] };
      return { fake, target, expiring };
    };
    const rejected = await refreshing(async () => {
      throw new ModelsError('oauth', 'invalid_grant: the refresh token is revoked');
    });
    await expect(authorizeSignin(rejected.fake.ctx as unknown as Ctx, `${provider}/m1`, rejected.target)).rejects.toMatchObject({
      problem: { code: 'kvai/SIGNIN_EXPIRED', params: { provider } },
    });
    expect(await rejected.fake.ctx.secrets.get(`${provider}.oauth`)).toBe(JSON.stringify(rejected.expiring));

    const temporary = await refreshing(async () => {
      throw new Error('fetch failed: socket hang up');
    });
    const failure = await authorizeSignin(temporary.fake.ctx as unknown as Ctx, `${provider}/m1`, temporary.target).then(
      () => {
        throw new Error('the call should have failed');
      },
      (error: unknown): unknown => error,
    );
    expect(failure).toMatchObject({ problem: { code: 'kvai/PROVIDER_ERROR', params: { model: `${provider}/m1`, transient: true } } });

    const shared = makeSharedSigninMaps();
    const broken = makeFakeSigninCtx('job-e13-broken', shared);
    await broken.ctx.secrets.set(`${provider}.oauth`, 'broken{{{');
    await expect(readOauthCredential(broken.ctx, provider)).rejects.toMatchObject({
      problem: { code: 'kvai/SIGNIN_EXPIRED', params: { provider } },
    });
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.oauth': 'broken{{{' } } });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ connection: 'oauth', status: 'ready' });
  });

  it('QA15-E14 tokens never leak from a call', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e14', shared);
    const access = 'access-e14-concealed';
    const refresh = 'refresh-e14-concealed';
    const failed: AssistantMessage = { ...okMessage, stopReason: 'error', errorMessage: `upstream exploded ${access} then ${refresh} end` };
    const seen: (SimpleStreamOptions | undefined)[] = [];
    const oauth = makeSigninOauth(async () => oauthOf('unused', 'unused', 0));
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models, model } = makeSigninModels(provider, oauth, store, scriptedApi(seen, failed));
    const credential = oauthOf(access, refresh, Date.now() + 3_600_000);
    await fake.ctx.secrets.set(`${provider}.oauth`, JSON.stringify(credential));
    const target: Extract<Target, { kind: 'model' }> = { kind: 'model', models, model, provider, apiKey: undefined, signedIn: true, secrets: [access, refresh] };
    await expect(callModel(fake.ctx as unknown as Ctx, `${provider}/m1`, target, { messages: [{ role: 'user', content: 'hi', timestamp: 1 }] })).rejects.toMatchObject({
      problem: { code: 'kvai/PROVIDER_ERROR', params: { model: `${provider}/m1`, reason: 'upstream exploded [secret] then [secret] end', transient: false } },
    });
  });

  it('QA15-E17 no environment, no files', async () => {
    const realKey = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'env-key-that-must-be-ignored';
    try {
      const shared = makeSharedSigninMaps();
      const fake = makeFakeSigninCtx('job-e17', shared);
      await expect(resolveTarget(fake.ctx as unknown as Ctx, emptyCatalog, 'anthropic/claude-sonnet-5-5')).rejects.toMatchObject({
        problem: { code: 'kvai/KEY_MISSING', params: { provider: 'anthropic' } },
      });
      const catalog = await builtinCatalog();
      const model = catalog.getModel('anthropic', 'claude-sonnet-5-5');
      if (model === undefined) throw new Error('anthropic/claude-sonnet-5-5 is missing');
      await expect(catalog.getAuth(model)).resolves.toBeUndefined();
      expect(await noAmbientAuth.env('ANTHROPIC_API_KEY')).toBeUndefined();
      expect(await noAmbientAuth.fileExists('~/.aws/credentials')).toBe(false);
    } finally {
      if (realKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = realKey;
    }
  });
});
