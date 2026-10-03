import { z, type Ctx } from '@kvman/sdk';

// Where a running sign-in can be found (ADR 0009, 231–232): the document `signin/<provider>` in the global store holds
// the newest sign-in's job id and the kind of prompt it waits at. A pasted answer is a secret, never a document.

const stateSchema = z.object({ jobId: z.string(), promptKind: z.enum(['text', 'select', 'manual_code']).nullable() });

type State = z.output<typeof stateSchema>;

type StateContext = Pick<Ctx, 'store' | 'job'>;

const stateKey = (provider: string): string => `signin/${provider}`;

/** The secret a prompt's answer is written to. */
export const answerSecretName = (provider: string): string => `${provider}.signinAnswer`;

export async function readState(ctx: Pick<Ctx, 'store'>, provider: string): Promise<State | undefined> {
  const stored = stateSchema.safeParse(await ctx.store.global.kv.get(stateKey(provider)));
  return stored.success ? stored.data : undefined;
}

/** Makes this job the newest sign-in of the provider. */
export function startSignin(ctx: StateContext, provider: string): Promise<void> {
  return ctx.store.global.kv.set(stateKey(provider), { jobId: ctx.job.id, promptKind: null });
}

function changeOwn(ctx: StateContext, provider: string, change: (state: State) => State | undefined): Promise<void> {
  return ctx.store.transaction((tx) => {
    const stored = stateSchema.safeParse(tx.global.kv.get(stateKey(provider)));
    if (!stored.success || stored.data.jobId !== ctx.job.id) return;
    const next = change(stored.data);
    if (next === undefined) tx.global.kv.delete(stateKey(provider));
    else tx.global.kv.set(stateKey(provider), next);
  });
}

/** Says this sign-in waits at a prompt, unless a newer sign-in owns the document. */
export function markWaiting(ctx: StateContext, provider: string, promptKind: NonNullable<State['promptKind']>): Promise<void> {
  return changeOwn(ctx, provider, (state) => ({ ...state, promptKind }));
}

/** Says the prompt is answered, or with `remove` deletes the document; a newer sign-in's is left alone. */
export function clearWaiting(ctx: StateContext, provider: string, remove = false): Promise<void> {
  return changeOwn(ctx, provider, (state) => (remove ? undefined : { ...state, promptKind: null }));
}
