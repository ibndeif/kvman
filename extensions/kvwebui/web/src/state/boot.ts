import { kernelQuery } from '../api/kernel.ts';
import { problemOf } from '../api/client.ts';
import { iconNames } from '../contributions/icons.ts';
import { loadRegistry } from '../contributions/registry.ts';
import { applyLanguage, applyTheme } from './appearance.ts';
import type { I18nState } from './i18n.ts';
import { settingValue, workspaceMemory, type Kvwebui } from './kvwebui.ts';
import { reloadPreset } from './preset.ts';
import { reloadWorkspaces, startWorkspace } from './workspaces.ts';

// What kvwebui loads when the browser opens it (plan 06 §6.2–§6.3): the tab's workspace (taking `?workspace=` once and
// removing it from the URL), the kernel's health, settings, and extensions, the language's catalog, and every
// extension's contributions.

async function takeStartWorkspace(state: Kvwebui): Promise<void> {
  const route = state.router.currentRoute.value;
  const fromUrl = typeof route.query['workspace'] === 'string' ? route.query['workspace'] : undefined;
  await reloadWorkspaces(state);
  state.workspace.value = startWorkspace(state.workspaces.value, fromUrl);
  workspaceMemory.write(state.workspace.value);
  if ('workspace' in route.query) {
    const query = Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'workspace'));
    await state.router.replace({ path: route.path, query, hash: route.hash });
  }
}

async function load(state: Kvwebui, i18n: I18nState): Promise<void> {
  await takeStartWorkspace(state);
  const [health, settings, extensions] = await Promise.all([
    kernelQuery(state.api, 'kernel.health.get', {}),
    kernelQuery(state.api, 'kernel.settings.list', {}),
    kernelQuery(state.api, 'kernel.extensions.list', {}),
  ]);
  state.health.value = health;
  state.settings.value = settings;
  state.extensions.value = extensions;
  await reloadPreset(state);
  const language = settingValue(state, 'kernel.language');
  await applyLanguage(state, i18n, typeof language === 'string' ? language : 'en');
  applyTheme(state);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state));
  state.registry.value = await loadRegistry(state.api, extensions, iconNames);
  state.booted.value = true;
}

export async function boot(state: Kvwebui, i18n: I18nState): Promise<void> {
  await state.router.isReady();
  await load(state, i18n).catch((error: unknown) => {
    state.bootProblem.value = problemOf(error);
  });
}
