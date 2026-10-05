import type { Kvman } from '@kvman/sdk/web';
import { computed, onMounted, ref, watch } from 'vue';
import { toastProblem } from './kvman.ts';

// The connectors list of kvcoder's configuration (plan 08 §8.7, ADR 0014, 10): kvcoder's own six, then the registered
// ones and the programs, each on unless `kvcoder.connectors.disabled` names it. A switch writes that setting in the
// scope the extension's page is set to.

/** kvcoder's own connectors, in the prompt's order (the server's `builtinConnectors`). */
export const ownConnectors = ['shell', 'fs', 'artifact', 'background', 'ask', 'subagent'] as const;

const disabledKey = 'kvcoder.connectors.disabled';

export type ConnectorItem = { name: string; description: string; origin: string; on: boolean };

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : []);

export function useConnectors(kvman: Kvman) {
  const added = ref<{ name: string; description: string; owner: string; kind: 'commands' | 'binary' }[]>([]);
  const disabled = ref<string[]>([]);
  const source = ref('default');
  const saving = ref(false);

  const load = async (): Promise<void> => {
    const [connectors, settings] = await Promise.all([kvman.exec('kvcoder.connector.list', {}), kvman.exec('kernel.settings.list', {})]);
    const setting = settings.find((candidate) => candidate.key === disabledKey);
    added.value = connectors;
    disabled.value = names(setting?.value);
    source.value = setting?.source ?? 'default';
  };

  const items = computed<ConnectorItem[]>(() => [
    ...ownConnectors.map((name) => ({ name, description: kvman.t(`kvcoder.config.connector.${name}`), origin: kvman.t('kvcoder.config.connectors.builtin') })),
    ...added.value.map((connector) => ({
      name: connector.name,
      description: connector.description,
      origin: connector.kind === 'binary' && connector.owner === 'kvcoder.connectors' ? kvman.t('kvcoder.config.connectors.program') : kvman.t('kvcoder.config.connectors.from', { owner: connector.owner }),
    })),
  ].map((item) => ({ ...item, on: !disabled.value.includes(item.name) })));

  // On "All workspaces", a list the workspace set for itself is the one in effect, and can't be edited from here.
  const locked = computed(() => kvman.scope.value === 'global' && source.value === 'workspace');
  const changed = computed(() => source.value === kvman.scope.value);

  const run = async (name: 'kernel.settings.set' | 'kernel.settings.reset', value?: string[]): Promise<void> => {
    saving.value = true;
    try {
      if (name === 'kernel.settings.set') await kvman.exec(name, { key: disabledKey, value: value ?? [], scope: kvman.scope.value });
      else await kvman.exec(name, { key: disabledKey, scope: kvman.scope.value });
      await load();
    } catch (error) {
      toastProblem(kvman, error);
    } finally {
      saving.value = false;
    }
  };

  onMounted(load);
  watch(() => [kvman.scope.value, kvman.workspace.value.id], load);

  return {
    items,
    locked,
    changed,
    saving,
    // Names the list doesn't show stay in the setting: only the toggled one changes.
    toggle: (name: string) => run('kernel.settings.set', disabled.value.includes(name) ? disabled.value.filter((other) => other !== name) : [...disabled.value, name]),
    reset: () => run('kernel.settings.reset'),
  };
}
