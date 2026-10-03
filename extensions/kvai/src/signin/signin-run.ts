import type { AuthEvent, AuthInteraction, AuthPrompt, Models } from '@earendil-works/pi-ai';
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { keySecretName, oauthSecretName } from '../catalog/provider-rows.ts';
import { realClock, storedTokens, type LeaseClock } from './credential-store.ts';
import type { SigninEvent } from './signin-events.ts';
import { answerSecretName, clearWaiting, markWaiting, startSignin } from './signin-state.ts';

// A sign-in with a person's plan (plan 07 §7.2, ADR 0009, 230–233). pi-ai runs the provider's own login; what the
// person must do is streamed as chunks, and a prompt waits for `kvai.provider.signin.answer` by reading a secret once a
// second. The job ends with the answer, the cancel, or the timeout, and always cleans up after itself.

const reasonLimit = 1000;
const answerPollMs = 1000;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

export type SigninContext = Pick<Ctx, 'secrets' | 'store' | 'job' | 'problem'>;

function signinFailed(ctx: Pick<Ctx, 'problem'>, provider: string, reason: string, hidden: readonly string[]) {
  const shown = hidden.filter((secret) => secret !== '').reduce((text, secret) => text.replaceAll(secret, '[secret]'), reason);
  return ctx.problem('kvai/SIGNIN_FAILED', { provider, reason: shown.slice(0, reasonLimit) });
}

function eventChunk(event: AuthEvent): SigninEvent {
  if (event.type === 'auth_url') return { type: 'auth_url', url: event.url };
  if (event.type === 'device_code') {
    return { type: 'device_code', userCode: event.userCode, verificationUri: event.verificationUri, ...(event.expiresInSeconds === undefined ? {} : { expiresInSeconds: event.expiresInSeconds }) };
  }
  return { type: 'progress' };
}

function promptChunk(prompt: Exclude<AuthPrompt, { type: 'secret' }>): SigninEvent {
  const { message } = prompt;
  if (prompt.type === 'select') return { type: 'prompt', kind: 'select', message, options: prompt.options.map((option) => ({ id: option.id, label: option.label, ...(option.description === undefined ? {} : { description: option.description }) })) };
  return { type: 'prompt', kind: prompt.type, message, ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }) };
}

async function takeAnswer(ctx: SigninContext, provider: string, signal: AbortSignal, clock: LeaseClock): Promise<string> {
  for (;;) {
    signal.throwIfAborted();
    const answer = await ctx.secrets.get(answerSecretName(provider));
    if (answer !== undefined) {
      await ctx.secrets.delete(answerSecretName(provider));
      return answer;
    }
    await clock.pause(answerPollMs, signal);
  }
}

/** pi-ai's override of the sign-in listener's address: loopback only (ADR 0009, 233). */
function checkCallbackHost(ctx: SigninContext, provider: string): void {
  const host = process.env['PI_OAUTH_CALLBACK_HOST'];
  if (host !== undefined && host !== '' && !loopbackHosts.has(host)) throw signinFailed(ctx, provider, 'callback host', []);
}

const deviceIdSchema = z.string().min(1);

async function deviceId(ctx: SigninContext): Promise<string> {
  return ctx.store.transaction((tx) => {
    const stored = deviceIdSchema.safeParse(tx.global.kv.get('deviceId'));
    if (stored.success) return stored.data;
    const made = crypto.randomUUID();
    tx.global.kv.set('deviceId', made);
    return made;
  });
}

export async function runSignin(ctx: SigninContext, models: Models, provider: string, clock: LeaseClock = realClock): Promise<Record<string, never>> {
  if (models.getProvider(provider)?.auth.oauth === undefined) throw ctx.problem('kvai/SIGNIN_UNSUPPORTED', { provider });
  checkCallbackHost(ctx, provider);
  const hidden = [(await ctx.secrets.get(keySecretName(provider))) ?? '', (await ctx.secrets.get(oauthSecretName(provider))) ?? '', ...(await storedTokens(ctx, provider))];
  const device = await deviceId(ctx);
  await startSignin(ctx, provider);
  const interaction: AuthInteraction = {
    signal: ctx.job.signal,
    notify: (event) => ctx.job.progress({ ...eventChunk(event) }),
    prompt: async (prompt) => {
      if (prompt.type === 'secret') throw signinFailed(ctx, provider, 'a secret prompt is not supported', hidden);
      await markWaiting(ctx, provider, prompt.type);
      ctx.job.progress({ ...promptChunk(prompt) });
      try {
        const answer = await takeAnswer(ctx, provider, prompt.signal === undefined ? ctx.job.signal : AbortSignal.any([ctx.job.signal, prompt.signal]), clock);
        hidden.push(answer);
        return answer;
      } finally {
        await clearWaiting(ctx, provider);
      }
    },
  };
  try {
    await models.login(provider, 'oauth', interaction, { getDeviceId: () => device });
    await ctx.secrets.delete(keySecretName(provider));
    return {};
  } catch (error) {
    ctx.job.signal.throwIfAborted();
    if (error instanceof ProblemError) throw error;
    throw signinFailed(ctx, provider, error instanceof Error ? error.message : String(error), hidden);
  } finally {
    await ctx.secrets.delete(answerSecretName(provider));
    await clearWaiting(ctx, provider, true);
  }
}
