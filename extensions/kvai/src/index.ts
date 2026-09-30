import type { Ctx } from '@kvman/sdk';
import { customCatalog } from './catalog/custom-catalog.ts';
import { registerComplete } from './register-complete.ts';
import { registerModels } from './register-models.ts';
import { registerProviders } from './register-providers.ts';
import { registerUi } from './register-ui.ts';
import { registerUsage } from './register-usage.ts';

export type { AssistantMessage, CompleteInput, CompleteOutput, Delta, Message } from './api.ts';

// kvai (plan 07): LLM calls through providers and models, and nothing else.
export default (ctx: Ctx): void => {
  const catalog = customCatalog(ctx);
  registerComplete(ctx, catalog);
  registerProviders(ctx, catalog);
  registerModels(ctx, catalog);
  registerUsage(ctx);
  registerUi(ctx);
};
