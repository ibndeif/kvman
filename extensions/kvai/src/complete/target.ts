import type { Api, Model, Models } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { builtinCatalog, builtinModel } from '../catalog/builtin-catalog.ts';
import type { CustomCatalog } from '../catalog/custom-catalog.ts';
import { customModels } from '../catalog/custom-provider.ts';
import { keySecretName } from '../catalog/provider-rows.ts';
import { splitModelId } from '../schemas/catalog.ts';

// What a call runs against (plan 07 §7.2, ADR 0009, 53): a pi-ai model with the key to send, or a delegate command.
// Only a built-in provider needs its key; a custom one sends the placeholder `none` without it.

export type Target =
  | { kind: 'model'; models: Models; model: Model<Api>; apiKey: string; secretKey: string | undefined }
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
    return { kind: 'model', ...customModels(custom, stored), apiKey: secretKey ?? keylessPlaceholder, secretKey };
  }
  const model = await builtinModel(parts.provider, parts.model);
  if (model === undefined) throw ctx.problem('kvai/MODEL_UNKNOWN', { model: fullId });
  if (secretKey === undefined) throw ctx.problem('kvai/KEY_MISSING', { provider: parts.provider });
  return { kind: 'model', models: await builtinCatalog(), model, apiKey: secretKey, secretKey };
}
