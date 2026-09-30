import { createModels, createProvider, type Api, type Model, type Models, type ProviderStreams } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { mistralConversationsApi } from '@earendil-works/pi-ai/api/mistral-conversations.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import type { ApiProvider, CustomApi, StoredModel } from '../schemas/catalog.ts';

// A custom `api` provider as a pi-ai provider (plan 07 §7.2, ADR 0009, 56): its model speaks the provider's wire API to
// its base URL, with its headers and compat flags. kvai passes the key with each call (ADR 0009, 53), so the provider's
// own auth resolves to nothing and never reads the environment.

const apiStreams: Record<CustomApi, () => ProviderStreams> = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
  'google-generative-ai': googleGenerativeAIApi,
  'mistral-conversations': mistralConversationsApi,
};

function piModel(provider: ApiProvider, model: StoredModel): Model<Api> {
  return {
    id: model.modelId,
    name: model.name,
    api: provider.api,
    provider: provider.providerId,
    baseUrl: provider.baseUrl,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(provider.headers === undefined ? {} : { headers: provider.headers }),
    // compat is JSON from `kvai.provider.add`; pi-ai reads the flags its API knows and ignores the rest.
    ...(provider.compat === undefined ? {} : { compat: provider.compat as NonNullable<Model<Api>['compat']> }),
  };
}

export function customModels(provider: ApiProvider, model: StoredModel): { models: Models; model: Model<Api> } {
  const chatModel = piModel(provider, model);
  const models = createModels();
  models.setProvider(
    createProvider({
      id: provider.providerId,
      name: provider.title,
      baseUrl: provider.baseUrl,
      auth: { apiKey: { name: provider.title, resolve: () => Promise.resolve({ auth: {} }) } },
      models: [chatModel],
      api: apiStreams[provider.api](),
    }),
  );
  return { models, model: chatModel };
}
