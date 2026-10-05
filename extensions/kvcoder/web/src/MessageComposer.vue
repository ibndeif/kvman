<script setup lang="ts">
import { ArrowUp, Paperclip, Square, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import { matchingCommands, typedCommand, type SlashName } from './slash-commands.ts';

// The send box (plan 08 §8.7; ADR 0017, 3, 6, and 11; ADR 0018, 5 and 6): Enter sends, Shift+Enter starts a new line;
// files are uploaded to the kernel's files (`POST /api/files`), from the attach button or a paste, and sent as
// `fileIds`; while a step runs, Stop cancels the turn. The `controls` slot holds the chat's model and thinking level.
// A one-line text that starts with `/` is a slash command, never a message: a list above the box names the matching
// ones, and with `commands` `run`, Enter runs the highlighted one; with `wait` (no chat yet) the list is greyed and
// nothing runs. While `blocked`, the box takes text and neither sends nor runs a command (ADR 0019, 3).
const props = defineProps<{ running: boolean; placeholder: string; blocked?: boolean | undefined; commands?: 'run' | 'wait' | undefined }>();
const emit = defineEmits<{ send: [message: { text: string; fileIds: string[] }]; stop: []; command: [name: SlashName, argument: string] }>();
const kvman = useKvman();
const text = ref('');
const files = ref<{ id: string; name: string }[]>([]);
const picker = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const highlight = ref(0);
const hidden = ref(false);

const typed = computed(() => (props.commands === undefined ? undefined : typedCommand(text.value)));
const waiting = computed(() => props.commands === 'wait');
const found = computed(() => (typed.value === undefined ? [] : matchingCommands(typed.value)));
watch(text, () => {
  highlight.value = 0;
  hidden.value = false;
});

async function attach(given: readonly File[]): Promise<void> {
  uploading.value = true;
  try {
    for (const file of given) {
      const query = new URLSearchParams({ name: file.name, workspaceId: kvman.workspace.value.id });
      const response = await fetch(`/api/files?${query.toString()}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      const answer: unknown = await response.json();
      const id = typeof answer === 'object' && answer !== null && 'file' in answer && typeof answer.file === 'object' && answer.file !== null && 'id' in answer.file ? String(answer.file.id) : undefined;
      if (id === undefined) kvman.toast('kvcoder.ui.uploadFailed', { name: file.name }, 'error');
      else files.value = [...files.value, { id, name: file.name }];
    }
  } finally {
    uploading.value = false;
  }
}

async function chosen(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.files === null) return;
  await attach([...input.files]);
  input.value = '';
}

// A paste that holds files attaches them and pastes no text; any other paste is the browser's.
function pasted(event: ClipboardEvent): void {
  const given = [...(event.clipboardData?.files ?? [])];
  if (given.length === 0) return;
  event.preventDefault();
  void attach(given);
}

function runCommand(): void {
  const command = found.value[highlight.value];
  const argument = typed.value?.argument ?? '';
  if (waiting.value || props.blocked === true || command === undefined || ('argument' in command && argument === '')) return;
  emit('command', command.name, argument);
  text.value = '';
}

function send(): void {
  if (typed.value !== undefined) return runCommand();
  const body = text.value.trim();
  if (body === '' || uploading.value || props.blocked === true) return;
  emit('send', { text: body, fileIds: files.value.map((file) => file.id) });
  text.value = '';
  files.value = [];
}

function move(step: number): void {
  if (!waiting.value && found.value.length > 0) highlight.value = (highlight.value + step + found.value.length) % found.value.length;
}

function commandKey(event: KeyboardEvent): boolean {
  if (typed.value === undefined) return false;
  const completed = found.value[highlight.value];
  if (event.key === 'Escape') hidden.value = true;
  else if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Tab' && completed !== undefined && !waiting.value) text.value = `/${completed.name} `;
  else return false;
  return true;
}

function onKey(event: KeyboardEvent): void {
  if (commandKey(event)) return event.preventDefault();
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}
</script>

<template>
  <div class="kvc-composer">
    <div class="kvc-box">
      <div v-if="typed !== undefined && !hidden" class="kvc-slash" role="listbox" :aria-label="kvman.t('kvcoder.ui.slash.title')" data-test="slash-list">
        <p v-if="waiting" class="kvc-muted kvc-none" data-test="slash-wait">{{ kvman.t('kvcoder.ui.slash.wait') }}</p>
        <div v-for="(command, index) in found" :key="command.name" class="kvc-slash-row" role="option" :aria-disabled="waiting" :aria-selected="!waiting && index === highlight" :data-active="!waiting && index === highlight" :data-test="`slash-${command.name}`" @mousemove="highlight = index" @click="highlight = index; runCommand()">
          <span class="kvc-slash-name"><span class="kvc-mono" dir="ltr">/{{ command.name }}<template v-if="'argument' in command"> &lt;{{ kvman.t(`kvcoder.ui.slash.${command.name}.argument`) }}&gt;</template></span></span>
          <span class="kvc-muted">{{ kvman.t(`kvcoder.ui.slash.${command.name}`) }}</span>
        </div>
        <p v-if="found.length === 0" class="kvc-muted kvc-none" data-test="slash-none">{{ kvman.t('kvcoder.ui.slash.none') }}</p>
      </div>
      <div v-if="files.length > 0" style="display: flex; gap: 6px; flex-wrap: wrap">
        <span v-for="file in files" :key="file.id" class="kvc-chip" data-test="attachment">{{ file.name }}<button type="button" class="kvc-ghost kvc-button" style="min-block-size: 20px; padding: 0" :aria-label="kvman.t('kvcoder.ui.removeAttachment')" @click="files = files.filter((kept) => kept.id !== file.id)"><X :size="12" /></button></span>
      </div>
      <textarea v-model="text" :placeholder="props.placeholder" :aria-label="props.placeholder" rows="2" data-test="composer-text" @keydown="onKey" @paste="pasted" />
      <div class="kvc-composer-row">
        <input ref="picker" type="file" multiple hidden data-test="composer-files" @change="chosen" />
        <button type="button" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.attach')" :title="kvman.t('kvcoder.ui.attach')" :disabled="uploading" @click="picker?.click()"><Paperclip :size="16" /></button>
        <slot name="controls" />
        <span class="kvc-muted kvc-composer-hint">{{ kvman.t('kvcoder.ui.enterSends') }}</span>
        <button v-if="props.running" type="button" class="kvc-button" data-test="stop" @click="emit('stop')"><Square :size="14" />{{ kvman.t('kvcoder.ui.stop') }}</button>
        <button type="button" class="kvc-button kvc-primary" :aria-label="kvman.t('kvcoder.ui.send')" :disabled="text.trim() === '' || uploading || props.blocked === true" data-test="send" @click="send"><ArrowUp :size="16" /></button>
      </div>
    </div>
  </div>
</template>
