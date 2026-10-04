import type { Ctx } from '@kvman/sdk';
import { builtinCatalog, useCredentials } from './catalog/builtin-catalog.ts';
import { customCatalog } from './catalog/custom-catalog.ts';
import { registerComplete } from './register-complete.ts';
import { registerDocs } from './docs.ts';
import { registerModels } from './register-models.ts';
import { registerProviders } from './register-providers.ts';
import { registerUi } from './register-ui.ts';
import { registerUsage } from './register-usage.ts';
import { credentialStore } from './signin/credential-store.ts';
import { registerSignin } from './signin/register-signin.ts';

export type { AssistantMessage, CompleteInput, CompleteOutput, Delta, Message, SigninEvent } from './api.ts';

// kvai (plan 07): LLM calls through providers and models, and nothing else.
export default (ctx: Ctx): void => {
  const catalog = customCatalog(ctx);
  useCredentials(credentialStore(ctx, async () => (await builtinCatalog()).getProviders().filter((provider) => provider.auth.oauth !== undefined).map((provider) => provider.id)));
  registerComplete(ctx, catalog);
  registerProviders(ctx, catalog);
  registerSignin(ctx, catalog);
  registerModels(ctx, catalog);
  registerUsage(ctx);
  registerDocs(ctx);
  registerUi(ctx);
};
