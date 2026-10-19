<script setup lang="ts">
import { ArrowUp, Paperclip, Square, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { clipboardImages } from './clipboard-images.ts';
import { problemText, useKvman } from './kvman.ts';
import { messageDraft } from './message-drafts.ts';
import { matchingCommands, typedCommand, type ListedSlash, type RegisteredSlash, type SlashName } from './slash-commands.ts';

// The send box (plan 08 §8.7; ADR 0017, 3, 6, and 11; ADR 0018, 5 and 6): Enter sends, Shift+Enter starts a new line;
// files are uploaded to the kernel's files (`POST /api/files`), from the attach button or a paste (ADR 0073), and sent as
// `fileIds`; while a step runs, Stop cancels the turn. The `controls` slot holds the chat's model and thinking level.
// A one-line text that starts with `/` is a slash command, never a message: a list above the box names the matching
// ones, and with `commands` `run`, Enter runs the highlighted one; with `wait` (no chat yet) kvcoder's own commands are
// greyed and only the `registered` ones run. While `blocked`, the box takes text and neither sends nor runs a command
// (ADR 0019, 3). After kvcoder's own commands the list has the `registered` ones of other extensions, which run as
// `registered` (ADR 0027, 9; ADR 0028, 1 and 3). The text and attachments are the chat's draft: they stay until the
// send is confirmed, the box is disabled while it is on its way, and a failed send says so above the box (ADR 0048, 6).
// Stop shows for a `stoppable` turn, reads "Stopping…" while `stopping`, and a failed stop says so too (ADR 0049, 3).
// In the empty box, Esc presses Stop and Up brings back `lastSent`, the person's last message (ADR 0090, 6).
const props = defineProps<{ sessionId?: string | undefined; lastSent?: string | undefined; stoppable: boolean; stopping?: boolean | undefined; stopError?: unknown; placeholder: string; blocked?: boolean | undefined; commands?: 'run' | 'wait' | undefined; registered?: readonly RegisteredSlash[] | undefined }>();
const emit = defineEmits<{ send: [message: { text: string; fileIds: string[] }]; stop: []; command: [name: SlashName, argument: string]; registered: [command: RegisteredSlash, argument: string] }>();
const kvman = useKvman();
const draft = computed(() => messageDraft(kvman.workspace.value.id, props.sessionId));
const picker = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const highlight = ref(0);
const hidden = ref(false);

const typed = computed(() => (props.commands === undefined ? undefined : typedCommand(draft.value.text)));
const waiting = computed(() => props.commands === 'wait');
const found = computed(() => (typed.value === undefined ? [] : matchingCommands(typed.value, props.registered ?? [])));
const canRun = (row: ListedSlash): boolean => !waiting.value || row.kind === 'registered';
const runnable = computed(() => found.value.filter(canRun));
const active = computed(() => runnable.value[highlight.value]);
const greyed = computed(() => runnable.value.length < found.value.length);
const needsArgument = (row: ListedSlash): boolean => row.kind === 'own' && 'argument' in row.command;
const described = (row: ListedSlash): string => kvman.t(row.kind === 'own' ? `kvcoder.ui.slash.${row.command.name}` : row.command.description);
watch(() => draft.value.text, () => {
  highlight.value = 0;
  hidden.value = false;
});

async function attach(given: readonly File[]): Promise<void> {
  const target = draft.value;
  uploading.value = true;
  try {
    for (const file of given) {
      const query = new URLSearchParams({ name: file.name, workspaceId: kvman.workspace.value.id });
      const response = await fetch(`/api/files?${query.toString()}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      const answer: unknown = await response.json();
      const id = typeof answer === 'object' && answer !== null && 'file' in answer && typeof answer.file === 'object' && answer.file !== null && 'id' in answer.file ? String(answer.file.id) : undefined;
      if (id === undefined) kvman.toast('kvcoder.ui.uploadFailed', { name: file.name }, 'error');
      else target.files = [...target.files, { id, name: file.name }];
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

async function attachCopiedImages(): Promise<void> {
  let images: File[];
  try {
    images = await clipboardImages();
  } catch {
    kvman.toast('kvcoder.ui.pasteFailed', {}, 'error');
    return;
  }
  await attach(images);
}

// A paste that holds files attaches them and pastes no text; an empty one reads the clipboard for a copied image
// (ADR 0073, 3); any other paste is the browser's.
function pasted(event: ClipboardEvent): void {
  const given = [...(event.clipboardData?.files ?? [])];
  if (given.length === 0) {
    if (event.clipboardData?.types.length === 0) void attachCopiedImages();
    return;
  }
  event.preventDefault();
  void attach(given);
}

function runCommand(): void {
  const row = active.value;
  const argument = typed.value?.argument ?? '';
  if (props.blocked === true || row === undefined || (needsArgument(row) && argument === '')) return;
  if (row.kind === 'own') emit('command', row.command.name, argument);
  else emit('registered', row.command, argument);
  draft.value.text = '';
}

function send(): void {
  if (typed.value !== undefined) return runCommand();
  const body = draft.value.text.trim();
  if (body === '' || uploading.value || props.blocked === true || draft.value.sending) return;
  emit('send', { text: body, fileIds: draft.value.files.map((file) => file.id) });
}

function move(step: number): void {
  if (runnable.value.length > 0) highlight.value = (highlight.value + step + runnable.value.length) % runnable.value.length;
}

function hover(row: ListedSlash): void {
  if (canRun(row)) highlight.value = runnable.value.indexOf(row);
}

function choose(row: ListedSlash): void {
  if (!canRun(row)) return;
  hover(row);
  runCommand();
}

function commandKey(event: KeyboardEvent): boolean {
  if (typed.value === undefined) return false;
  const completed = active.value;
  if (event.key === 'Escape') hidden.value = true;
  else if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Tab' && completed !== undefined) draft.value.text = `/${completed.command.name} `;
  else return false;
  return true;
}

// Keys that act only on an empty box: a list or menu that is open has had them first.
function emptyBoxKey(event: KeyboardEvent): boolean {
  if (draft.value.text !== '') return false;
  if (event.key === 'Escape' && props.stoppable && props.stopping !== true) emit('stop');
  else if (event.key === 'ArrowUp' && props.lastSent !== undefined && props.lastSent !== '') draft.value.text = props.lastSent;
  else return false;
  return true;
}

function onKey(event: KeyboardEvent): void {
  if (commandKey(event) || emptyBoxKey(event)) return event.preventDefault();
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}
</script>

<template>
  <div class="kvc-composer">
    <div class="kvc-box">
      <div v-if="typed !== undefined && !hidden" class="kvc-slash" role="listbox" :aria-label="kvman.t('kvcoder.ui.slash.title')" data-test="slash-list">
        <p v-if="greyed" class="kvc-muted kvc-none" data-test="slash-wait">{{ kvman.t('kvcoder.ui.slash.wait') }}</p>
        <div v-for="row in found" :key="row.command.name" class="kvc-slash-row" role="option" :aria-disabled="!canRun(row)" :aria-selected="row === active" :data-active="row === active" :data-test="`slash-${row.command.name}`" @mousemove="hover(row)" @click="choose(row)">
          <span class="kvc-slash-name"><span class="kvc-mono" dir="ltr">/{{ row.command.name }}<template v-if="needsArgument(row)"> &lt;{{ kvman.t(`kvcoder.ui.slash.${row.command.name}.argument`) }}&gt;</template></span></span>
          <span class="kvc-muted">{{ described(row) }}</span>
        </div>
        <p v-if="found.length === 0" class="kvc-muted kvc-none" data-test="slash-none">{{ kvman.t('kvcoder.ui.slash.none') }}</p>
      </div>
      <p v-if="draft.error !== undefined" class="kvc-muted" style="margin: 0" role="alert" data-test="send-error">{{ kvman.t('kvcoder.ui.sendFailed', { error: problemText(kvman.t, draft.error) }) }}</p>
      <p v-if="props.stopError !== undefined" class="kvc-muted" style="margin: 0" role="alert" data-test="stop-error">{{ kvman.t('kvcoder.ui.stopFailed', { error: problemText(kvman.t, props.stopError) }) }}</p>
      <div v-if="draft.files.length > 0" style="display: flex; gap: 6px; flex-wrap: wrap">
        <span v-for="file in draft.files" :key="file.id" class="kvc-chip" data-test="attachment">{{ file.name }}<button type="button" class="kvc-ghost kvc-button kvc-chip-remove" :aria-label="kvman.t('kvcoder.ui.removeAttachment')" :disabled="draft.sending" @click="draft.files = draft.files.filter((kept) => kept.id !== file.id)"><X :size="12" /></button></span>
      </div>
      <textarea v-model="draft.text" :disabled="draft.sending" :aria-busy="draft.sending" :placeholder="props.placeholder" :aria-label="props.placeholder" rows="2" data-test="composer-text" @keydown="onKey" @paste="pasted" />
      <div class="kvc-composer-row">
        <input ref="picker" type="file" multiple hidden data-test="composer-files" @change="chosen" />
        <button type="button" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.attach')" :title="kvman.t('kvcoder.ui.attach')" :disabled="uploading || draft.sending" @click="picker?.click()"><Paperclip :size="16" /></button>
        <slot name="controls" />
        <span class="kvc-muted kvc-composer-hint">{{ kvman.t('kvcoder.ui.enterSends') }}</span>
        <button v-if="props.stoppable" type="button" class="kvc-button" :disabled="props.stopping === true" data-test="stop" @click="emit('stop')"><Square :size="14" />{{ kvman.t(props.stopping === true ? 'kvcoder.ui.stopping' : 'kvcoder.ui.stop') }}</button>
        <button type="button" class="kvc-button kvc-primary" :aria-label="kvman.t('kvcoder.ui.send')" :disabled="draft.text.trim() === '' || uploading || props.blocked === true || draft.sending" data-test="send" @click="send"><ArrowUp :size="16" /></button>
      </div>
    </div>
  </div>
</template>
