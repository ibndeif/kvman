import { ProblemError, type Problem } from '@kvman/sdk';
import type { Component } from 'vue';

// Custom components (plan 06 §6.4): `/web/<namespace>/components/<name>.js`, which default-exports a Vue component, and
// the CSS file beside it when there is one, both with the extension's revision in their URLs; each loads once.

/** Loads a component's module and its stylesheet; a missing stylesheet resolves too. */
export type ComponentLoader = { module(url: string): Promise<unknown>; stylesheet(url: string): Promise<void> };

export type Components = { load(component: string): Promise<Component> };

export function componentFailed(component: string, message: string): Problem {
  return { code: 'kvwebui/COMPONENT_FAILED', message, params: { component } };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function defaultExport(module: unknown): unknown {
  return typeof module === 'object' && module !== null ? Reflect.get(module, 'default') : undefined;
}

function isComponent(value: unknown): value is Component {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function createComponents(loader: ComponentLoader, revisionOf: (namespace: string) => number): Components {
  const loaded = new Map<string, Promise<Component>>();
  const load = async (component: string): Promise<Component> => {
    const [namespace = '', name = ''] = component.split('.');
    const file = `/web/${namespace}/components/${name}`;
    const revision = `?revision=${String(revisionOf(namespace))}`;
    const [module] = await Promise.all([
      loader.module(`${file}.js${revision}`).catch((error: unknown) => {
        throw new ProblemError(componentFailed(component, `${file}.js couldn't be loaded: ${messageOf(error)}`));
      }),
      loader.stylesheet(`${file}.css${revision}`),
    ]);
    const found = defaultExport(module);
    if (!isComponent(found)) throw new ProblemError(componentFailed(component, `${file}.js has no default export.`));
    return found;
  };
  return {
    load: (component) => {
      const known = loaded.get(component);
      if (known !== undefined) return known;
      const loading = load(component);
      loaded.set(component, loading);
      return loading;
    },
  };
}

// A component that threw while it was shown.
export function componentThrew(component: string, error: unknown): Problem {
  return componentFailed(component, `It failed: ${messageOf(error)}`);
}
