<script setup lang="ts">
import { Blocks, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { iconComponent } from '../../contributions/icons.ts';
import { builtinPages, orderedNav, pageLocation, routePage } from '../../state/navigation.ts';
import { rememberNavCollapsed, settingValue, useKvwebui } from '../../state/kvwebui.ts';

// The nav (plan 06 §6.2): contributed items, then the built-in pages below a divider. It collapses to icons only.
const state = useKvwebui();
const { t } = useI18n();
const route = useRoute();

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const items = computed(() => orderedNav(state.registry.value.nav, strings(settingValue(state, 'kvwebui.nav.order')), strings(settingValue(state, 'kvwebui.nav.hidden'))));
const builtins = [
  { id: 'kvwebui.settings', path: '/kvwebui/settings', title: 'kvwebui.pages.settings', icon: SlidersHorizontal },
  { id: 'kvwebui.extensions', path: '/kvwebui/extensions', title: 'kvwebui.pages.extensions', icon: Blocks },
];
const collapsed = state.navCollapsed;
const toggle = (): void => {
  collapsed.value = !collapsed.value;
  rememberNavCollapsed(collapsed.value);
};
// The page the route shows: at `/`, the preset's home page.
const currentPage = computed(() => {
  const home = settingValue(state, 'kvwebui.home');
  if (route.path === '/') return typeof home === 'string' ? home : undefined;
  return routePage(state.registry.value, route)?.id ?? Object.keys(builtinPages).find((id) => builtinPages[id]?.path === route.path);
});
const linkClass = (page: string): string[] => ['flex h-10 items-center gap-2.5 rounded-xl px-3', page === currentPage.value ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-neutral-ink'];
</script>

<template>
  <nav :aria-label="t('kvwebui.nav.label')" class="flex shrink-0 flex-col gap-0.5 border-e border-line bg-sunken p-3" :class="collapsed ? 'w-17' : 'w-58'" data-test="nav">
    <RouterLink
      v-for="item in items"
      :key="item.id"
      :to="pageLocation(state.registry.value, item.page, {})"
      :class="linkClass(item.page)"
      :aria-current="item.page === currentPage ? 'page' : undefined"
      :title="collapsed ? t(item.title) : undefined"
      :aria-label="collapsed ? t(item.title) : undefined"
      :data-test="`nav-${item.id}`"
    >
      <component :is="iconComponent(item.icon)" class="size-4.5 shrink-0" aria-hidden="true" />
      <span v-if="!collapsed">{{ t(item.title) }}</span>
    </RouterLink>
    <hr class="mx-1 my-2.5 border-line" />
    <RouterLink
      v-for="page in builtins"
      :key="page.id"
      :to="page.path"
      :class="linkClass(page.id)"
      :aria-current="page.id === currentPage ? 'page' : undefined"
      :title="collapsed ? t(page.title) : undefined"
      :aria-label="collapsed ? t(page.title) : undefined"
      :data-test="`nav-${page.id}`"
    >
      <component :is="page.icon" class="size-4.5 shrink-0" aria-hidden="true" />
      <span v-if="!collapsed">{{ t(page.title) }}</span>
    </RouterLink>
    <div class="grow" />
    <button type="button" class="grid size-10 place-items-center rounded-xl text-neutral-ink" :aria-label="t(collapsed ? 'kvwebui.nav.expand' : 'kvwebui.nav.collapse')" data-test="nav-toggle" @click="toggle">
      <PanelLeftOpen v-if="collapsed" class="size-4.5 rtl:-scale-x-100" aria-hidden="true" />
      <PanelLeftClose v-else class="size-4.5 rtl:-scale-x-100" aria-hidden="true" />
    </button>
  </nav>
</template>
