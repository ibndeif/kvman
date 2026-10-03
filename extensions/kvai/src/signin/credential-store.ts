import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { oauthSecretName } from '../catalog/provider-rows.ts';

// pi-ai's credential store over kvai's secrets (plan 07 §7.2, ADR 0009, 227–228 and 234). A sign-in is the secret
// `<provider>.oauth`. Refreshing rewrites it, and a refresh token may rotate, so `modify` runs under a lease in the
// global store: one worker at a time per provider. pi-ai re-reads the credential inside `modify`, so a worker that
// waited sees what the first one wrote.

const leaseMs = 30_000;
const waitMs = 35_000;
const pollMs = 100;

const oauthCredentialSchema = z.looseObject({ type: z.literal('oauth'), access: z.string(), refresh: z.string(), expires: z.number() });

const leaseSchema = z.object({ holder: z.string(), expiresAt: z.number() });

/** What the lease waits with: the time, and a pause that a cancel ends. Real ones by default. */
export type LeaseClock = { now(): number; pause(ms: number, signal: AbortSignal): Promise<void> };

export const realClock: LeaseClock = {
  now: () => Date.now(),
  pause: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }),
};

type StoreContext = Pick<Ctx, 'secrets' | 'store' | 'job' | 'problem'>;

/** The credential in `<provider>.oauth`, `undefined` when there is none; a stored one that isn't valid fails `kvai/SIGNIN_EXPIRED`. */
export async function readOauthCredential(ctx: Pick<Ctx, 'secrets' | 'problem'>, provider: string): Promise<Credential | undefined> {
  const text = await ctx.secrets.get(oauthSecretName(provider));
  if (text === undefined) return undefined;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    throw ctx.problem('kvai/SIGNIN_EXPIRED', { provider });
  }
  const parsed = oauthCredentialSchema.safeParse(stored);
  if (!parsed.success) throw ctx.problem('kvai/SIGNIN_EXPIRED', { provider });
  return parsed.data;
}

/** The tokens of the stored sign-in, to hide from a failure's reason; none when there is none or it isn't valid. */
export async function storedTokens(ctx: Pick<Ctx, 'secrets' | 'problem'>, provider: string): Promise<string[]> {
  try {
    return tokensOf(await readOauthCredential(ctx, provider));
  } catch (error) {
    if (error instanceof ProblemError) return [];
    throw error;
  }
}

/** Every token of a credential, to hide from a failure's reason. */
export function tokensOf(credential: Credential | undefined): string[] {
  return credential?.type === 'oauth' ? [credential.access, credential.refresh] : [];
}

async function takeLease(ctx: StoreContext, clock: LeaseClock, provider: string, holder: string): Promise<void> {
  const key = `lease/${provider}`;
  const deadline = clock.now() + waitMs;
  for (;;) {
    const taken = await ctx.store.transaction((tx) => {
      const lease = leaseSchema.safeParse(tx.global.kv.get(key));
      if (lease.success && lease.data.expiresAt > clock.now()) return false;
      tx.global.kv.set(key, { holder, expiresAt: clock.now() + leaseMs });
      return true;
    });
    if (taken) return;
    if (clock.now() >= deadline) throw ctx.problem('kvai/PROVIDER_ERROR', { provider, reason: 'timed out waiting for another refresh of the sign-in', transient: true });
    await clock.pause(pollMs, ctx.job.signal);
  }
}

function releaseLease(ctx: StoreContext, provider: string, holder: string): Promise<void> {
  return ctx.store.transaction((tx) => {
    const key = `lease/${provider}`;
    const lease = leaseSchema.safeParse(tx.global.kv.get(key));
    if (lease.success && lease.data.holder === holder) tx.global.kv.delete(key);
  });
}

/** `providers` are the ids that may hold a sign-in: what pi-ai's `list` looks through. */
export function credentialStore(ctx: StoreContext, providers: () => Promise<readonly string[]>, clock: LeaseClock = realClock): CredentialStore {
  return {
    read: (providerId) => readOauthCredential(ctx, providerId),
    list: async (): Promise<CredentialInfo[]> => {
      const saved = await Promise.all((await providers()).map(async (providerId) => ((await ctx.secrets.get(oauthSecretName(providerId))) === undefined ? [] : [{ providerId, type: 'oauth' as const }])));
      return saved.flat();
    },
    modify: async (providerId, change) => {
      const holder = crypto.randomUUID();
      await takeLease(ctx, clock, providerId, holder);
      try {
        const current = await readOauthCredential(ctx, providerId);
        const next = await change(current);
        if (next === undefined) return current;
        if (next.type !== 'oauth') throw ctx.problem('kvai/SIGNIN_FAILED', { provider: providerId, reason: 'a sign-in saves an OAuth credential' });
        await ctx.secrets.set(oauthSecretName(providerId), JSON.stringify(next));
        return next;
      } finally {
        await releaseLease(ctx, providerId, holder);
      }
    },
    delete: (providerId) => ctx.secrets.delete(oauthSecretName(providerId)),
  };
}
