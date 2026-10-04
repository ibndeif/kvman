import type { Json, PresetState, Problem, Workspace } from '@kvman/sdk';
import { inject, ref, shallowRef, type InjectionKey, type Ref, type ShallowRef } from 'vue';
import type { Router } from 'vue-router';
import { createApi, type Api } from '../api/client.ts';
import type { ExtensionInfo, Health, SettingInfo } from '../api/kernel.ts';
import { problemKey, problemParams } from '../api/problem-text.ts';
import { emptyRegistry, type Registry } from '../contributions/registry.ts';
import { createComponents, type ComponentLoader, type Components } from './components.ts';
import { createConfirmations, type Confirmations } from './confirmations.ts';
import { createJobStreams, type JobStreams } from './job-streams.ts';
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
  // The preset as stored now, or why it couldn't be read (ADR 0010, 5).
  preset: ShallowRef<PresetState | undefined>;
  presetProblem: ShallowRef<Problem | undefined>;
  registry: ShallowRef<Registry>;
  components: Components;
  jobs: JobStreams;
  // The jobs the UI follows, each until its reruns and effects are done.
  followed: Map<string, Promise<void>>;
  // Grows after each command the UI runs; the page's queries and the status items rerun when it changes.
  revision: Ref<number>;
  language: Ref<string>;
  booted: Ref<boolean>;
  bootProblem: ShallowRef<Problem | undefined>;
  panel: Ref<string | null>;
  navCollapsed: Ref<boolean>;
  // True below 768 px (ADR 0009, 134), where the nav is always the icon rail and opens as an overlay.
  narrow: Ref<boolean>;
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
const narrowQuery = '(max-width: 767px)';

function watchNarrow(): Ref<boolean> {
  const media = window.matchMedia(narrowQuery);
  const narrow = ref(media.matches);
  media.addEventListener('change', (event) => (narrow.value = event.matches));
  return narrow;
}

export function createState(router: Router, fetcher: typeof fetch, loader: ComponentLoader): Kvwebui {
  const workspace = ref(homeWorkspaceId);
  const extensions = shallowRef<ExtensionInfo[]>([]);
  const api = createApi({
    fetch: fetcher,
    workspaceId: () => workspace.value,
    onProblem: (problem) => {
      if (problem.code === 'NOT_FOUND' && problem.params?.['workspaceId'] === workspace.value && workspace.value !== homeWorkspaceId) state.onWorkspaceGone(workspace.value);
    },
  });
  const state: Kvwebui = {
    api,
    router,
    toasts: createToasts(),
    confirmations: createConfirmations(),
    workspace,
    workspaces: ref([]),
    health: shallowRef(),
    online: ref(true),
    settings: shallowRef([]),
    extensions,
    preset: shallowRef(),
    presetProblem: shallowRef(),
    registry: shallowRef(emptyRegistry()),
    components: createComponents(loader, (namespace) => extensions.value.find((extension) => extension.namespace === namespace)?.revision ?? 0),
    jobs: createJobStreams(api),
    followed: new Map(),
    revision: ref(0),
    language: ref('en'),
    booted: ref(false),
    bootProblem: shallowRef(),
    panel: ref(panelMemory.read()),
    navCollapsed: ref(localStorage.getItem(navCollapsedKey) === 'true'),
    narrow: watchNarrow(),
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
