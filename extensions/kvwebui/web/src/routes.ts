import type { RouteRecordRaw } from 'vue-router';
import ContributedRoute from './components/pages/ContributedRoute.vue';
import ExtensionPage from './components/pages/ExtensionPage.vue';
import ExtensionsPage from './components/pages/ExtensionsPage.vue';
import HomeRoute from './components/pages/HomeRoute.vue';
import NotFoundPage from './components/pages/NotFoundPage.vue';
import SettingsPage from './components/pages/SettingsPage.vue';

// `/` is the preset's home page; the built-in pages, and each extension's own page (ADR 0014, 4), come before the contributed ones, `/<namespace>/<page>/<params…>`.

export const routes: RouteRecordRaw[] = [
  { path: '/', component: HomeRoute },
  { path: '/kvwebui/settings', component: SettingsPage },
  { path: '/kvwebui/extensions', component: ExtensionsPage },
  { path: '/kvwebui/extension/:namespace', component: ExtensionPage },
  { path: '/:namespace/:page/:params*', component: ContributedRoute },
  { path: '/:unknown(.*)*', component: NotFoundPage },
];
