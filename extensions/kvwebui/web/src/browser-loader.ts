import type { ComponentLoader } from './state/components.ts';

// How the browser loads a custom component (plan 06 §6.4): the module through `import()`, where the page's import map
// gives it kvwebui's `vue`, and the stylesheet as a `<link>`, removed again when the extension has no CSS file.
export const browserComponentLoader: ComponentLoader = {
  module: (url) => import(/* @vite-ignore */ url),
  stylesheet: (url) =>
    new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.addEventListener('load', () => resolve());
      link.addEventListener('error', () => {
        link.remove();
        resolve();
      });
      document.head.append(link);
    }),
};
