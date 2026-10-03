import type { Kvman } from '@kvman/sdk/web';

// Sets the default model (plan 07 §7.3, ADR 0009, 244): writes the global setting, then toasts. A rejection
// propagates, so the caller shows it and nothing is toasted.
export async function setDefaultModel(kvman: Kvman, modelId: string): Promise<void> {
  await kvman.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: modelId, scope: 'global' });
  kvman.toast('kvai.ui.models.defaultSet', {}, 'success');
}
