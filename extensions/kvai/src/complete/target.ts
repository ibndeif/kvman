import type { Api, Model, Models } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { builtinCatalog, builtinModel } from '../catalog/builtin-catalog.ts';
import type { CustomCatalog } from '../catalog/custom-catalog.ts';
import { customModels } from '../catalog/custom-provider.ts';
import { keySecretName } from '../catalog/provider-rows.ts';
import { splitModelId } from '../schemas/catalog.ts';
import { readOauthCredential, tokensOf } from '../signin/credential-store.ts';

// What a call runs against (plan 07 §7.2, ADR 0009, 53 and 235): a pi-ai model with the key to send (or, for a provider
// connected by a sign-in, no key: pi-ai reads and refreshes the credential), or a delegate command. Only a built-in
// provider needs a key or a sign-in; a custom one sends the placeholder `none` without a key. `secrets` are the values a
// failure's reason must not show.

export type Target =
  | { kind: 'model'; models: Models; model: Model<Api>; provider: string; apiKey: string | undefined; signedIn: boolean; secrets: string[] }
  | { kind: 'delegate'; command: string };

const keylessPlaceholder = 'none';

export async function resolveTarget(ctx: Ctx, catalog: CustomCatalog, fullId: string): Promise<Target> {
  const parts = splitModelId(fullId);
  if (parts === undefined) throw ctx.problem('kvai/MODEL_UNKNOWN', { model: fullId });
  const secretKey = await ctx.secrets.get(keySecretName(parts.provider));
  const custom = await catalog.provider(parts.provider);
  if (custom !== undefined) {
    const stored = await catalog.model(parts.provider, parts.model);
    if (stored === undefined) throw ctx.problem('kvai/MODEL_UNKNOWN', { model: fullId });
    if ('delegate' in custom) return { kind: 'delegate', command: custom.delegate };
    return { kind: 'model', ...customModels(custom, stored), provider: parts.provider, apiKey: secretKey ?? keylessPlaceholder, signedIn: false, secrets: secretKey === undefined ? [] : [secretKey] };
  }
  const model = await builtinModel(parts.provider, parts.model);
  if (model === undefined) throw ctx.problem('kvai/MODEL_UNKNOWN', { model: fullId });
  const models = await builtinCatalog();
  const credential = await readOauthCredential(ctx, parts.provider);
  if (credential !== undefined) return { kind: 'model', models, model, provider: parts.provider, apiKey: undefined, signedIn: true, secrets: tokensOf(credential) };
  if (secretKey === undefined) throw ctx.problem('kvai/KEY_MISSING', { provider: parts.provider });
  return { kind: 'model', models, model, provider: parts.provider, apiKey: secretKey, signedIn: false, secrets: [secretKey] };
}
