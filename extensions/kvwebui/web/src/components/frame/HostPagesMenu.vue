<script setup lang="ts">
import { Blocks, SlidersHorizontal } from '@lucide/vue';
import { computed, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { iconComponent } from '../../contributions/icons.ts';
import { stringList } from '../../state/hidden-screens.ts';
import { orderedNav, pageLocation } from '../../state/navigation.ts';
import { settingValue, useKvwebui } from '../../state/kvwebui.ts';

// The pages menu of an embedded page (plan 06 §6.2, ADR 0100, 13): the host asks for it, since the page has no nav. It
// lists the nav items, then Settings and Extensions; a pick, a press outside, or Escape closes it.
const state = useKvwebui();
const { t } = useI18n();
const open = state.host.pagesOpen;

const hidden = computed(() => stringList(settingValue(state, 'kvwebui.nav.hidden')));
const items = computed(() => orderedNav(state.registry.value.nav, stringList(settingValue(state, 'kvwebui.nav.order')), hidden.value).map((item) => ({ id: item.id, to: pageLocation(state.registry.value, item.page, {}), title: item.title, icon: iconComponent(item.icon) })));
const builtins = computed(() =>
  [
    { id: 'kvwebui.settings', to: '/kvwebui/settings', title: 'kvwebui.pages.settings', icon: SlidersHorizontal },
    { id: 'kvwebui.extensions', to: '/kvwebui/extensions', title: 'kvwebui.pages.extensions', icon: Blocks },
  ].filter((page) => !hidden.value.includes(page.id)),
);

const close = (): void => {
  open.value = false;
};
const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') close();
};
watch(open, (now) => (now ? window.addEventListener('keydown', closeOnEscape) : window.removeEventListener('keydown', closeOnEscape)));
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40" data-test="pages-backdrop" @click.self="close">
    <nav :aria-label="t('kvwebui.pages.menu')" class="absolute end-2 top-2 flex min-w-48 flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-xl" data-test="pages-menu">
      <RouterLink v-for="item in [...items, ...builtins]" :key="item.id" :to="item.to" class="flex h-9 items-center gap-2.5 rounded-lg px-3 text-neutral-ink hover:bg-accent-soft" :data-test="`pages-${item.id}`" @click="close">
        <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ t(item.title) }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
