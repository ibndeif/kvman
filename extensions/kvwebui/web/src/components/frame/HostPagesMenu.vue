<script setup lang="ts">
import { Blocks, Check, ChevronDown, Globe, SlidersHorizontal } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { iconComponent } from '../../contributions/icons.ts';
import { directionOf, languageName, setLanguage } from '../../state/appearance.ts';
import { stringList } from '../../state/hidden-screens.ts';
import { useI18nState } from '../../state/i18n.ts';
import { orderedNav, pageLocation } from '../../state/navigation.ts';
import { setPanel } from '../../state/panels.ts';
import { settingValue, showProblem, useKvwebui } from '../../state/kvwebui.ts';

// The pages menu of an embedded page (plan 06 §6.2, ADR 0100, 13, ADR 0101, 1 and 4): the host asks for it, since the
// page has no nav. It lists the nav items, the panels, then Settings and Extensions, and the Language row; a pick, a
// press outside, or Escape closes it.
const state = useKvwebui();
const i18n = useI18nState();
const { t } = useI18n();
const open = state.host.pagesOpen;
const languagesOpen = ref(false);

const hidden = computed(() => stringList(settingValue(state, 'kvwebui.nav.hidden')));
const items = computed(() => orderedNav(state.registry.value.nav, stringList(settingValue(state, 'kvwebui.nav.order')), hidden.value).map((item) => ({ id: item.id, to: pageLocation(state.registry.value, item.page, {}), title: item.title, icon: iconComponent(item.icon) })));
const panels = computed(() => state.registry.value.panels.map((panel) => ({ id: panel.id, title: panel.title, icon: iconComponent(panel.icon) })));
const builtins = computed(() =>
  [
    { id: 'kvwebui.settings', to: '/kvwebui/settings', title: 'kvwebui.pages.settings', icon: SlidersHorizontal },
    { id: 'kvwebui.extensions', to: '/kvwebui/extensions', title: 'kvwebui.pages.extensions', icon: Blocks },
  ].filter((page) => !hidden.value.includes(page.id)),
);
const languages = computed(() => state.health.value?.languages ?? []);

const close = (): void => {
  open.value = false;
};
const togglePanel = (id: string): void => {
  setPanel(state, state.panel.value === id ? null : id);
  close();
};
const chooseLanguage = async (language: string): Promise<void> => {
  close();
  await setLanguage(state, i18n, language).catch((error: unknown) => showProblem(state, problemOf(error)));
};
const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') close();
};
watch(open, (now) => {
  languagesOpen.value = false;
  if (now) window.addEventListener('keydown', closeOnEscape);
  else window.removeEventListener('keydown', closeOnEscape);
});
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));
const rowClass = 'flex h-9 items-center gap-2.5 rounded-lg px-3 text-start text-neutral-ink hover:bg-accent-soft';
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40" data-test="pages-backdrop" @click.self="close">
    <nav :aria-label="t('kvwebui.pages.menu')" class="absolute end-2 top-2 flex max-h-[calc(100%-1rem)] min-w-52 flex-col gap-0.5 overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl" data-test="pages-menu">
      <RouterLink v-for="item in items" :key="item.id" :to="item.to" :class="rowClass" :data-test="`pages-${item.id}`" @click="close">
        <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(item.title) }}</span>
      </RouterLink>
      <button v-for="panel in panels" :key="panel.id" type="button" :class="[rowClass, panel.id === state.panel.value ? 'bg-accent-soft' : '']" :aria-pressed="panel.id === state.panel.value" :data-test="`pages-panel-${panel.id}`" @click="togglePanel(panel.id)">
        <component :is="panel.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(panel.title) }}</span>
      </button>
      <RouterLink v-for="item in builtins" :key="item.id" :to="item.to" :class="rowClass" :data-test="`pages-${item.id}`" @click="close">
        <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(item.title) }}</span>
      </RouterLink>
      <hr v-if="languages.length > 1" class="mx-1 my-1 border-line" />
      <button v-if="languages.length > 1" type="button" :class="rowClass" :aria-expanded="languagesOpen" data-test="pages-language" @click="languagesOpen = !languagesOpen">
        <Globe class="size-4 shrink-0" aria-hidden="true" />
        <span class="grow">{{ t('kvwebui.language.label') }}</span>
        <span class="text-muted" data-test="pages-language-current">{{ languageName(state.language.value) }}</span>
        <ChevronDown class="size-3.5 shrink-0 text-muted" :class="languagesOpen ? 'rotate-180' : ''" aria-hidden="true" />
      </button>
      <template v-if="languagesOpen">
        <button v-for="language in languages" :key="language" type="button" :lang="language" :dir="directionOf(language)" :class="[rowClass, 'ps-9']" :data-test="`pages-language-${language}`" @click="chooseLanguage(language)">
          <span class="grow">{{ languageName(language) }}</span>
          <Check v-if="language === state.language.value" class="size-4 text-primary" aria-hidden="true" />
        </button>
      </template>
    </nav>
  </div>
</template>
