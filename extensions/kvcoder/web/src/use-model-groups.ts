import { onMounted, ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { modelGroups, type ModelGroup } from './model-groups.ts';

/** The model picker's groups (ADR 0009, 136): ready providers' models, and `current` whatever its provider's status. */
export function useModelGroups(kvman: Kvman, current: () => string | null, failed: (error: unknown) => void) {
  const groups = ref<ModelGroup[]>([]);
  onMounted(async () => {
    try {
      const [providers, models] = await Promise.all([kvman.exec('kvai.provider.list', {}), kvman.exec('kvai.model.list', {})]);
      groups.value = modelGroups(providers, models, current());
    } catch (error) {
      failed(error);
    }
  });
  return groups;
}
