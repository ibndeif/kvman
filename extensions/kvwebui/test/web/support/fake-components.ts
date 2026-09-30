import type { Component } from 'vue';
import type { ComponentLoader } from '../../../web/src/state/components.ts';

// A component loader for component tests: modules come from a table keyed by component id (`notes.chart`), a missing
// one fails like a failed `import()`, and every URL asked for is recorded.

export type FakeComponents = ComponentLoader & {
  requested: string[];
  modules: Map<string, () => Promise<unknown>>;
  define(component: string, definition: Component): void;
};

function componentOf(url: string): string {
  const match = /^\/web\/([^/]+)\/components\/([^/.]+)\.(?:js|css)\?revision=\d+$/.exec(url);
  return match === null ? url : `${match[1] ?? ''}.${match[2] ?? ''}`;
}

export function createFakeComponents(): FakeComponents {
  const requested: string[] = [];
  const modules = new Map<string, () => Promise<unknown>>();
  return {
    requested,
    modules,
    define: (component, definition) => modules.set(component, () => Promise.resolve({ default: definition })),
    module: (url) => {
      requested.push(url);
      const load = modules.get(componentOf(url));
      return load === undefined ? Promise.reject(new TypeError(`Failed to fetch dynamically imported module: ${url}`)) : load();
    },
    stylesheet: (url) => {
      requested.push(url);
      return Promise.resolve();
    },
  };
}
