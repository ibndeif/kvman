<script setup lang="ts">
import { X } from '@lucide/vue';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// A dialog for OpenUI's Modal and an image gallery's preview (plan 06 §6.1, ADR 0124, 16): over the page, with its title
// and a close button; Escape, the button, and a press outside close it; Tab stays inside while it is open, and focus
// returns where it was when it closes.
const props = defineProps<{ title: string; size?: 'sm' | 'md' | 'lg' | undefined }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const panel = ref<HTMLElement | null>(null);
const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };
const before = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || panel.value === null) return;
  const targets = [...panel.value.querySelectorAll<HTMLElement>(focusable)];
  const first = targets[0];
  const last = targets.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  await nextTick();
  panel.value?.querySelector<HTMLElement>(focusable)?.focus();
});
onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
  before?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" data-test="openui-dialog-backdrop" @click.self="emit('close')">
      <div ref="panel" role="dialog" aria-modal="true" :aria-label="props.title" class="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-5 text-ink shadow-2xl" :class="widths[props.size ?? 'md']">
        <div class="flex items-start justify-between gap-3">
          <h2 dir="auto" class="m-0 text-base font-semibold">{{ props.title }}</h2>
          <button type="button" class="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-muted" :aria-label="t('kvwebui.openui.close')" data-test="openui-dialog-close" @click="emit('close')">
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
