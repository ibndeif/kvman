import { createApp, type App as VueApp } from 'vue';
import { createRouter, type Router, type RouterHistory } from 'vue-router';
import App from './components/App.vue';
import { routes } from './routes.ts';
import type { ComponentLoader } from './state/components.ts';
import { createI18nState, i18nKey, type I18nState } from './state/i18n.ts';
import { createState, kvwebuiKey, type Kvwebui } from './state/kvwebui.ts';
import { moveHome } from './state/workspaces.ts';

// Makes the app: the browser build uses the page's history, `fetch`, and the browser's component loader; tests give a
// memory history, a fake API, fixture components, and a `reload` they can count.

export type KvwebuiApp = { app: VueApp; router: Router; state: Kvwebui; i18n: I18nState };

export function createKvwebui(options: { history: RouterHistory; fetch: typeof fetch; components: ComponentLoader; reload: () => void }): KvwebuiApp {
  const router = createRouter({ history: options.history, routes });
  const state = createState(router, options.fetch, options.components, options.reload);
  const i18n = createI18nState();
  state.onWorkspaceGone = (workspaceId) => {
    void moveHome(state, workspaceId);
  };
  const app = createApp(App);
  app.use(router);
  app.use(i18n.plugin);
  app.provide(kvwebuiKey, state);
  app.provide(i18nKey, i18n);
  return { app, router, state, i18n };
}
