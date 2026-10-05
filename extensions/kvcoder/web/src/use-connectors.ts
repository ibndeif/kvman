import type { Kvman } from '@kvman/sdk/web';
import { computed, onMounted, ref, watch } from 'vue';
import { useSetting } from './use-setting.ts';

// The connectors list of kvcoder's configuration (plan 08 §8.7, ADR 0014, 10; ADR 0015, 4 and 5): kvcoder's own seven,
// then the registered ones and the programs, each on unless `kvcoder.connectors.disabled` names it. A switch writes
// that setting in the scope the extension's page is set to. A connector with a configuration of its own has a cog.

/** kvcoder's own connectors, in the prompt's order (the server's `builtinConnectors`). */
export const ownConnectors = ['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'mcp'] as const;

/** The connectors with a configuration of their own, which their cog opens (ADR 0020, 2). */
export const configurableConnectors: readonly string[] = ['shell', 'delegate', 'mcp'];

export type ConnectorItem = { name: string; description: string; on: boolean; configurable: boolean };

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : []);

export function useConnectors(kvman: Kvman) {
  const added = ref<{ name: string; description: string }[]>([]);
  const setting = useSetting(kvman, 'kvcoder.connectors.disabled');
  const disabled = computed(() => names(setting.value.value));

  const load = async (): Promise<void> => {
    added.value = await kvman.exec('kvcoder.connector.list', {});
  };

  const items = computed<ConnectorItem[]>(() =>
    [...ownConnectors.map((name) => ({ name, description: kvman.t(`kvcoder.config.connector.${name}`) })), ...added.value.map((connector) => ({ name: connector.name, description: connector.description }))].map((item) => ({ ...item, on: !disabled.value.includes(item.name), configurable: configurableConnectors.includes(item.name) })),
  );

  onMounted(load);
  watch(() => kvman.workspace.value.id, load);

  return {
    items,
    locked: setting.locked,
    changed: setting.changed,
    saving: setting.saving,
    // Names the list doesn't show stay in the setting: only the toggled one changes.
    toggle: (name: string) => setting.set(disabled.value.includes(name) ? disabled.value.filter((other) => other !== name) : [...disabled.value, name]),
    reset: setting.reset,
  };
}
