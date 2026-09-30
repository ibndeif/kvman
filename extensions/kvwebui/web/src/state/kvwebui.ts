import type { Json, Problem, Workspace } from '@kvman/sdk';
import { inject, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import type { Router } from 'vue-router';
import { createApi, type Api } from '../api/client.ts';
import type { ExtensionInfo, Health, SettingInfo } from '../api/kernel.ts';
import { problemKey, problemParams } from '../api/problem-text.ts';
import { emptyRegistry, type Registry } from '../contributions/registry.ts';
import { createConfirmations, type Confirmations } from './confirmations.ts';
import { tabMemory } from './tab-memory.ts';
import { createToasts, type Toasts } from './toasts.ts';

// kvwebui's state in one browser tab: the API, the tab's workspace, what the kernel and the extensions gave at load,
// and the frame's own state. Components reach it with `useKvwebui()`.

export const homeWorkspaceId = 'home';

export type Kvwebui = {
  api: Api;
  router: Router;
  toasts: Toasts;
  confirmations: Confirmations;
  workspace: Ref<string>;
  workspaces: Ref<Workspace[]>;
  health: ShallowRef<Health | undefined>;
  online: Ref<boolean>;
  settings: ShallowRef<SettingInfo[]>;
  extensions: ShallowRef<ExtensionInfo[]>;
  registry: ShallowRef<Registry>;
  // Grows after each command the UI runs; the page's queries and the status items rerun when it changes.
  revision: Ref<number>;
  language: Ref<string>;
  booted: Ref<boolean>;
  bootProblem: ShallowRef<Problem | undefined>;
  panel: Ref<string | null>;
  navCollapsed: Ref<boolean>;
  // Called with the tab's workspace when an answer says it was closed elsewhere.
  onWorkspaceGone: (workspaceId: string) => void;
};

export const kvwebuiKey: InjectionKey<Kvwebui> = Symbol('kvwebui');

export function useKvwebui(): Kvwebui {
  const kvwebui = inject(kvwebuiKey);
  if (kvwebui === undefined) throw new Error('useKvwebui() runs only inside the kvwebui app.');
  return kvwebui;
}

export const workspaceMemory = tabMemory('kvwebui.workspace');
export const panelMemory = tabMemory('kvwebui.panel');
const navCollapsedKey = 'kvwebui.nav.collapsed';

export function createState(router: Router, fetcher: typeof fetch): Kvwebui {
  const workspace = ref(homeWorkspaceId);
  const state: Kvwebui = {
    api: createApi({
      fetch: fetcher,
      workspaceId: () => workspace.value,
      onProblem: (problem) => {
        if (problem.code === 'NOT_FOUND' && problem.params?.['workspaceId'] === workspace.value && workspace.value !== homeWorkspaceId) state.onWorkspaceGone(workspace.value);
      },
    }),
    router,
    toasts: createToasts(),
    confirmations: createConfirmations(),
    workspace,
    workspaces: ref([]),
    health: shallowRef(),
    online: ref(true),
    settings: shallowRef([]),
    extensions: shallowRef([]),
    registry: shallowRef(emptyRegistry()),
    revision: ref(0),
    language: ref('en'),
    booted: ref(false),
    bootProblem: shallowRef(),
    panel: ref(panelMemory.read()),
    navCollapsed: ref(localStorage.getItem(navCollapsedKey) === 'true'),
    onWorkspaceGone: () => undefined,
  };
  return state;
}

export function rememberNavCollapsed(collapsed: boolean): void {
  localStorage.setItem(navCollapsedKey, String(collapsed));
}

export function settingValue(state: Kvwebui, key: string): Json | undefined {
  return state.settings.value.find((setting) => setting.key === key)?.value;
}

export function showProblem(state: Kvwebui, problem: Problem, hint?: string): void {
  state.toasts.show({ text: problemKey(problem), params: problemParams(problem), level: 'error', ...(hint === undefined ? {} : { hint }) });
}

// Runs a command for the UI: on success, the page's queries and the status items rerun (plan 06 §6.3–§6.4).
export async function runCommand(state: Kvwebui, name: string, input: Json): Promise<Json> {
  const output = await state.api.command(name, input);
  state.revision.value += 1;
  return output;
}
