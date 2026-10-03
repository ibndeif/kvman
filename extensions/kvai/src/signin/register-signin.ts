import { z, type Ctx } from '@kvman/sdk';
import { builtinCatalog } from '../catalog/builtin-catalog.ts';
import type { CustomCatalog } from '../catalog/custom-catalog.ts';
import { providerExists } from '../catalog/provider-rows.ts';
import { runSignin } from './signin-run.ts';
import { answerSecretName, readState } from './signin-state.ts';

// The sign-in commands (plan 07 §7.2, ADR 0009, 230–232). `start` is the job; `answer` is sync only, so the pasted
// value never lands in a job row; `cancel` ends the newest sign-in so its listener closes at once.

const empty = z.object({});
const providerInput = z.object({ provider: z.string().min(1) });
const answerInput = z.object({ provider: z.string().min(1), answer: z.string().min(1).meta({ writeOnly: true }) });
const signinTimeoutMs = 300_000;

async function knownProvider(ctx: Ctx, catalog: CustomCatalog, provider: string): Promise<void> {
  if (!(await providerExists(catalog, provider))) throw ctx.problem('kvai/PROVIDER_UNKNOWN', { provider });
}

export async function answerSignin(ctx: Pick<Ctx, 'store' | 'secrets' | 'problem'>, provider: string, answer: string): Promise<void> {
  const state = await readState(ctx, provider);
  if (state === undefined || state.promptKind === null) throw ctx.problem('kvai/SIGNIN_NOT_WAITING', { provider });
  await ctx.secrets.set(answerSecretName(provider), answer);
}

export async function cancelSignin(ctx: Pick<Ctx, 'store' | 'cancel'>, provider: string): Promise<void> {
  const state = await readState(ctx, provider);
  if (state !== undefined) await ctx.cancel(state.jobId);
}

export function registerSignin(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerCommand('kvai.provider.signin.start', {
    description: "Signs in to a provider with the person's plan, and waits for the person where the provider asks.",
    input: providerInput,
    output: empty,
    public: true,
    retries: 0,
    timeoutMs: signinTimeoutMs,
    handle: async (input) => {
      await knownProvider(ctx, catalog, input.provider);
      return runSignin(ctx, await builtinCatalog(), input.provider);
    },
  });
  ctx.registerCommand('kvai.provider.signin.answer', {
    description: 'Answers the prompt a sign-in waits at.',
    input: answerInput,
    output: empty,
    public: true,
    syncOnly: true,
    handle: async (input) => {
      await knownProvider(ctx, catalog, input.provider);
      await answerSignin(ctx, input.provider, input.answer);
      return {};
    },
  });
  ctx.registerCommand('kvai.provider.signin.cancel', {
    description: "Cancels a provider's running sign-in.",
    input: providerInput,
    output: empty,
    public: true,
    handle: async (input) => {
      await knownProvider(ctx, catalog, input.provider);
      await cancelSignin(ctx, input.provider);
      return {};
    },
  });
}
