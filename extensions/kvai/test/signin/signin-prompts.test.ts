import { describe, expect, it } from 'vitest';
import type { OAuthCredential } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { credentialStore } from '../../src/signin/credential-store.ts';
import { answerSignin, cancelSignin } from '../../src/signin/register-signin.ts';
import { runSignin } from '../../src/signin/signin-run.ts';
import { readState } from '../../src/signin/signin-state.ts';
import { makeFakeClock, makeFakeSigninCtx, makeSharedSigninMaps, makeSigninModels, makeSigninOauth, untilSeen } from '../support/fake-signin-ctx.ts';

const provider = 'plan-prompts';

const credential: OAuthCredential = { type: 'oauth', access: 'access-prompts', refresh: 'refresh-prompts', expires: 2_000_000_000 };

const isPromptChunk = (kind: string): ((chunk: unknown) => boolean) => (chunk) => JSON.stringify(chunk).includes(`"kind":"${kind}"`);

describe('a sign-in waiting at a prompt (07 §7.2, ADR 0009, 231–232)', () => {
  it('QA15-H7 a prompt waits for its answer', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-h7', shared);
    const received: string[] = [];
    const oauth = makeSigninOauth(async (interaction) => {
      received.push(
        await interaction.prompt({ type: 'select', message: 'Pick a plan', options: [{ id: 'pro', label: 'Pro', description: 'Monthly' }, { id: 'team', label: 'Team' }] }),
      );
      received.push(await interaction.prompt({ type: 'text', message: 'Your name?', placeholder: 'Ada' }));
      received.push(await interaction.prompt({ type: 'manual_code', message: 'Paste the redirect URL', placeholder: 'https://…' }));
      return credential;
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    const run = runSignin(fake.ctx, models, provider, clock);
    await untilSeen(() => fake.chunks.some(isPromptChunk('select')), 'select prompt');
    expect(fake.chunks).toContainEqual({
      type: 'prompt',
      kind: 'select',
      message: 'Pick a plan',
      options: [{ id: 'pro', label: 'Pro', description: 'Monthly' }, { id: 'team', label: 'Team' }],
    });
    expect(await readState(fake.ctx, provider)).toEqual({ jobId: 'job-h7', promptKind: 'select' });
    await answerSignin(fake.ctx, provider, 'pro');
    await untilSeen(() => received.length >= 1, 'first answer');
    expect(received[0]).toBe('pro');
    expect(await fake.ctx.secrets.get(`${provider}.signinAnswer`)).toBeUndefined();
    await untilSeen(() => fake.chunks.some(isPromptChunk('text')), 'text prompt');
    expect(fake.chunks).toContainEqual({ type: 'prompt', kind: 'text', message: 'Your name?', placeholder: 'Ada' });
    expect(await readState(fake.ctx, provider)).toEqual({ jobId: 'job-h7', promptKind: 'text' });
    await answerSignin(fake.ctx, provider, 'Ada');
    await untilSeen(() => received.length >= 2, 'second answer');
    await untilSeen(() => fake.chunks.some(isPromptChunk('manual_code')), 'manual_code prompt');
    expect(fake.chunks).toContainEqual({ type: 'prompt', kind: 'manual_code', message: 'Paste the redirect URL', placeholder: 'https://…' });
    await answerSignin(fake.ctx, provider, 'https://127.0.0.1:1455/callback?code=pasted-h7');
    await expect(run).resolves.toEqual({});
    expect(received).toEqual(['pro', 'Ada', 'https://127.0.0.1:1455/callback?code=pasted-h7']);
    expect(await readState(fake.ctx, provider)).toBeUndefined();
    expect(await fake.ctx.secrets.get(`${provider}.signinAnswer`)).toBeUndefined();
    expect(JSON.parse(await fake.ctx.secrets.get(`${provider}.oauth`) ?? 'missing')).toEqual(credential);
  });

  it('QA15-E7 cancel ends a waiting sign-in', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e7', shared);
    const canceller = makeFakeSigninCtx('job-e7-canceller', shared);
    let cancellations = 0;
    const countingCtx: Pick<Ctx, 'store' | 'cancel'> = {
      store: canceller.ctx.store,
      cancel: async (jobId: string): Promise<void> => {
        cancellations += 1;
        await canceller.ctx.cancel(jobId);
      },
    };
    const oauth = makeSigninOauth(async (interaction) => {
      await interaction.prompt({ type: 'text', message: 'Paste the redirect URL' });
      return credential;
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    const run = runSignin(fake.ctx, models, provider, clock);
    await untilSeen(() => fake.chunks.some(isPromptChunk('text')), 'text prompt');
    await fake.ctx.secrets.set(`${provider}.signinAnswer`, 'late-answer-e7');
    await cancelSignin(countingCtx, provider);
    expect(cancellations).toBe(1);
    const failure = await run.then(
      () => {
        throw new Error('the sign-in should have ended cancelled');
      },
      (error: unknown): unknown => error,
    );
    expect(fake.controller.signal.aborted).toBe(true);
    expect(failure).toBe(fake.controller.signal.reason);
    expect(await readState(fake.ctx, provider)).toBeUndefined();
    expect(await fake.ctx.secrets.get(`${provider}.signinAnswer`)).toBeUndefined();
    await cancelSignin(countingCtx, provider);
    expect(cancellations).toBe(1);
  });

  it('QA15-E12 a newer sign-in owns the document', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const older = makeFakeSigninCtx('job-old', shared);
    const newer = makeFakeSigninCtx('job-new', shared);
    const received: string[] = [];
    const oauth = makeSigninOauth(async (interaction) => {
      received.push(await interaction.prompt({ type: 'text', message: 'Paste the redirect URL' }));
      return credential;
    });
    const olderStore = credentialStore(older.ctx, () => Promise.resolve([provider]), clock);
    const newerStore = credentialStore(newer.ctx, () => Promise.resolve([provider]), clock);
    const olderModels = makeSigninModels(provider, oauth, olderStore);
    const newerModels = makeSigninModels(provider, oauth, newerStore);
    const olderRun = runSignin(older.ctx, olderModels.models, provider, clock);
    await untilSeen(() => older.chunks.some(isPromptChunk('text')), 'older prompt');
    const newerRun = runSignin(newer.ctx, newerModels.models, provider, clock);
    await untilSeen(() => newer.chunks.some(isPromptChunk('text')), 'newer prompt');
    expect(await readState(newer.ctx, provider)).toEqual({ jobId: 'job-new', promptKind: 'text' });
    older.controller.abort();
    await expect(olderRun).rejects.toBe(older.controller.signal.reason);
    expect(await readState(newer.ctx, provider)).toEqual({ jobId: 'job-new', promptKind: 'text' });
    await answerSignin(newer.ctx, provider, 'answer-for-newer');
    await expect(newerRun).resolves.toEqual({});
    expect(received).toEqual(['answer-for-newer']);
    expect(await readState(newer.ctx, provider)).toBeUndefined();
  });

  it('QA15-E6 an answer never reaches the database or the log', async () => {
    const shared = makeSharedSigninMaps();
    const { clock } = makeFakeClock();
    const fake = makeFakeSigninCtx('job-e6-sync', shared);
    const answer = 'https://localhost:1455/auth/callback?code=sekrit-e6sync';
    const oauth = makeSigninOauth(async (interaction) => {
      await interaction.prompt({ type: 'text', message: 'Paste the code' });
      return credential;
    });
    const store = credentialStore(fake.ctx, () => Promise.resolve([provider]), clock);
    const { models } = makeSigninModels(provider, oauth, store);
    const run = runSignin(fake.ctx, models, provider, clock);
    await untilSeen(() => fake.chunks.some(isPromptChunk('text')), 'text prompt');
    await answerSignin(fake.ctx, provider, answer);
    await expect(run).resolves.toEqual({});
    expect(JSON.stringify([...shared.kv.values()])).not.toContain('sekrit-e6sync');
    expect(JSON.stringify(fake.chunks)).not.toContain('sekrit-e6sync');
    expect(await fake.ctx.secrets.get(`${provider}.signinAnswer`)).toBeUndefined();
  });
});
