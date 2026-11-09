<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { useI18n } from 'vue-i18n';
import type { CardSource, ChatCardProps } from '../definitions/card.ts';
import { openWindow } from '../../state/embedded.ts';
import { useOpenuiLive } from '../presses.ts';
import { isWebAddress } from '../web-address.ts';
import { RenderedValue } from './RenderedValue.ts';

// The chat library's Card (plan 06 §6.1, ADR 0124, 4, 16): a vertical container and, when the model gave sources, a
// numbered Sources strip at the bottom. A source's web address opens through `kvman.open` only while the block is live.
const component = defineProps<ComponentRenderProps<ChatCardProps>>();
const { t } = useI18n();
const live = useOpenuiLive();

function open(source: CardSource): void {
  if (!live.value || source.url === undefined || !isWebAddress(source.url)) return;
  void openWindow(source.url);
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <RenderedValue :value="component.props.children" :render-node="component.renderNode" />
    <section v-if="component.props.sources !== undefined && component.props.sources.length > 0" class="border-t border-line pt-3" data-test="openui-sources">
      <h3 class="m-0 text-xs font-semibold tracking-wide text-muted">{{ t('kvwebui.openui.sources') }}</h3>
      <ol class="mt-2 flex list-decimal flex-col gap-1 ps-5 text-sm">
        <li v-for="(source, index) in component.props.sources" :key="index">
          <span dir="auto" class="font-medium">{{ source.title }}</span>
          <span aria-hidden="true"> · </span>
          <button v-if="source.url !== undefined && isWebAddress(source.url) && live" type="button" class="m-0 border-0 bg-transparent p-0 text-primary underline" dir="auto" @click="open(source)">
            {{ source.sourceName }}
          </button>
          <span v-else dir="auto">{{ source.sourceName }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
