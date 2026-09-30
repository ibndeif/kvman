import type { Ctx } from '@kvman/sdk';
import { storedModelSchema, storedProviderSchema, type StoredModel, type StoredProvider } from '../schemas/catalog.ts';

// Custom providers and models, kept in kvai's global store (plan 07 §7.2). Adding an id again replaces it, and
// removing a missing id does nothing (ADR 0009, 57). A store page holds at most 1000 documents.

const pageLimit = 1000;

export type CustomCatalog = {
  providers(): Promise<StoredProvider[]>;
  provider(providerId: string): Promise<StoredProvider | undefined>;
  putProvider(provider: StoredProvider): Promise<void>;
  removeProvider(providerId: string): Promise<void>;
  models(provider?: string): Promise<StoredModel[]>;
  model(provider: string, modelId: string): Promise<StoredModel | undefined>;
  putModel(model: StoredModel): Promise<void>;
  removeModel(provider: string, modelId: string): Promise<void>;
};

export function customCatalog(ctx: Ctx): CustomCatalog {
  // `ctx.store` exists only inside a handler, so each call reaches it when it runs.
  const providers = () => ctx.store.global.collection('providers', storedProviderSchema);
  const models = () => ctx.store.global.collection('models', storedModelSchema);
  return {
    providers: () => providers().find({}, { limit: pageLimit }),
    provider: async (providerId) => (await providers().find({ providerId }, { limit: 1 }))[0],
    putProvider: (provider) =>
      ctx.store.transaction((tx) => {
        const collection = tx.global.collection('providers', storedProviderSchema);
        for (const old of collection.find({ providerId: provider.providerId }, { limit: pageLimit })) collection.delete(old.id);
        collection.insert(provider);
      }),
    removeProvider: (providerId) =>
      ctx.store.transaction((tx) => {
        const providerCollection = tx.global.collection('providers', storedProviderSchema);
        const modelCollection = tx.global.collection('models', storedModelSchema);
        for (const old of providerCollection.find({ providerId }, { limit: pageLimit })) providerCollection.delete(old.id);
        for (const old of modelCollection.find({ provider: providerId }, { limit: pageLimit })) modelCollection.delete(old.id);
      }),
    models: (provider) => models().find(provider === undefined ? {} : { provider }, { limit: pageLimit }),
    model: async (provider, modelId) => (await models().find({ provider, modelId }, { limit: 1 }))[0],
    putModel: (model) =>
      ctx.store.transaction((tx) => {
        const collection = tx.global.collection('models', storedModelSchema);
        for (const old of collection.find({ provider: model.provider, modelId: model.modelId }, { limit: pageLimit })) collection.delete(old.id);
        collection.insert(model);
      }),
    removeModel: (provider, modelId) =>
      ctx.store.transaction((tx) => {
        const collection = tx.global.collection('models', storedModelSchema);
        for (const old of collection.find({ provider, modelId }, { limit: pageLimit })) collection.delete(old.id);
      }),
  };
}
