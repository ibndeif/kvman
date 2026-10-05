import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import type { Scope } from './setting-save.ts';

// Where an extension's page saves (ADR 0013, 2; ADR 0014, 4 and 8): the page's one switch sets it, and the setting
// rows and custom components of its configuration read it. Anywhere else it is `global`.

const settingsScopeKey: InjectionKey<Ref<Scope>> = Symbol('kvwebui-settings-scope');

/** Gives the views below this component a scope of their own, and returns it. */
export function provideSettingsScope(): Ref<Scope> {
  const scope = ref<Scope>('global');
  provide(settingsScopeKey, scope);
  return scope;
}

export function useSettingsScope(): Readonly<Ref<Scope>> {
  return inject(settingsScopeKey, ref<Scope>('global'));
}
