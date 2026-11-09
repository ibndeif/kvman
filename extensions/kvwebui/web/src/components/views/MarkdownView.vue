<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { computed, inject, type Directive } from 'vue';
import { useViewText } from '../../composables/use-view-text.ts';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import { insideOpenuiKey, openFenceAtEnd } from '../../openui/fences.ts';
import OpenuiBlock from '../../openui/OpenuiBlock.vue';
import { drawDiagrams } from './mermaid-diagrams.ts';
import QueryFrame from './QueryFrame.vue';

// Markdown (plan 06 §6.1, §6.4): markdown-it with HTML off, its output sanitized by DOMPurify. This is the only place
// kvwebui renders HTML. Each block takes its direction from its own text (ADR 0013, 12), so an English answer reads left to
// right in an Arabic app, and an Arabic one right to left in an English app. A fenced `mermaid` block is marked here
// and drawn as a diagram after each render (ADR 0067). A fenced `openui` block is drawn as UI (ADR 0124), in place.
type Segment = { kind: 'html'; html: string } | { kind: 'openui'; source: string; streaming: boolean };

const props = defineProps<{ view: Extract<View, { type: 'markdown' }>; scope: Scope }>();
const viewText = useViewText();
const insideOpenui = inject(insideOpenuiKey, false);
const markdown = new MarkdownIt({ html: false, linkify: true });
const directedBlocks = new Set(['paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open', 'list_item_open', 'blockquote_open', 'table_open']);
markdown.core.ruler.push('kvwebui-direction', (state) => {
  for (const token of state.tokens) if (directedBlocks.has(token.type)) token.attrSet('dir', 'auto');
});
const fence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  if (token === undefined || token.info.trim() !== 'mermaid') return fence?.(tokens, index, options, env, self) ?? '';
  return `<pre data-mermaid="source"><code>${markdown.utils.escapeHtml(token.content)}</code></pre>\n`;
};
// Inside OpenUI nothing loads from the network (ADR 0124, 7): an image that isn't a `data:` image is a placeholder with
// its alternative text and its address.
if (insideOpenui) {
  const image = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const source = String(token?.attrGet('src') ?? '');
    if (token === undefined || source.startsWith('data:image/')) return image?.(tokens, index, options, env, self) ?? '';
    const alt = markdown.utils.escapeHtml(token.content);
    return `<span class="kvwebui-openui-image" data-test="openui-image-placeholder">${alt} (${markdown.utils.escapeHtml(source)})</span>`;
  };
}
const vDiagrams: Directive<HTMLElement> = { mounted: (element) => void drawDiagrams(element), updated: (element) => void drawDiagrams(element) };

function html(tokens: Token[]): string {
  return DOMPurify.sanitize(markdown.renderer.render(tokens, markdown.options, {}));
}

function segmentsOf(source: string): Segment[] {
  const segments: Segment[] = [];
  let run: Token[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    segments.push({ kind: 'html', html: html(run) });
    run = [];
  };
  for (const token of markdown.parse(source, {})) {
    if (!insideOpenui && token.type === 'fence' && token.info.trim() === 'openui') {
      flush();
      segments.push({ kind: 'openui', source: token.content, streaming: openFenceAtEnd(source, token) });
      continue;
    }
    run.push(token);
  }
  flush();
  return segments;
}

const input = computed(() => resolveValues(props.view.input, props.scope));
const text = computed(() => (props.view.text === undefined ? '' : viewText(props.view.text, props.view.params, props.scope)));
const segments = computed(() => segmentsOf(text.value));
const fieldOf = (data: Json): string => {
  const value = typeof data === 'object' && data !== null && !Array.isArray(data) && props.view.field !== undefined ? data[props.view.field] : undefined;
  return typeof value === 'string' ? value : '';
};
</script>

<template>
  <div v-if="props.view.text !== undefined" v-diagrams class="kvwebui-markdown" data-test="markdown">
    <template v-for="(segment, index) in segments" :key="index">
      <div v-if="segment.kind === 'html'" class="kvwebui-markdown" v-html="segment.html" />
      <OpenuiBlock v-else library="chat" :source="segment.source" :streaming="segment.streaming" />
    </template>
  </div>
  <QueryFrame v-else v-slot="{ data }" :query="props.view.query ?? ''" :input="input">
    <div v-diagrams class="kvwebui-markdown" data-test="markdown">
      <template v-for="(segment, index) in segmentsOf(fieldOf(data))" :key="index">
        <div v-if="segment.kind === 'html'" class="kvwebui-markdown" v-html="segment.html" />
        <OpenuiBlock v-else library="chat" :source="segment.source" :streaming="segment.streaming" />
      </template>
    </div>
  </QueryFrame>
</template>
