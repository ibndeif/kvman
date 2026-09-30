import { defineAsyncComponent, type Component } from 'vue';

// Contributed icons are lucide names (plan 06 §6.3). Each icon is its own module, loaded when first shown; the module
// paths give the names an answer may use.

// `icons/index.mjs` re-exports every icon, so it's left out.
const modules = import.meta.glob<{ default: Component }>(['../../../node_modules/@lucide/vue/dist/esm/icons/*.mjs', '!../../../node_modules/@lucide/vue/dist/esm/icons/index.mjs']);

const loaders = new Map(Object.entries(modules).map(([file, load]) => [file.slice(file.lastIndexOf('/') + 1, -'.mjs'.length), load]));

export const iconNames: ReadonlySet<string> = new Set(loaders.keys());

const components = new Map<string, Component>();

export function iconComponent(name: string): Component | undefined {
  const load = loaders.get(name);
  if (load === undefined) return undefined;
  const known = components.get(name);
  if (known !== undefined) return known;
  const component = defineAsyncComponent(async () => (await load()).default);
  components.set(name, component);
  return component;
}
