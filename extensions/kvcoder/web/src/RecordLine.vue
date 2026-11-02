<script setup lang="ts">
import { Circle, Mic, Play, RotateCcw, Square, Upload, Volume2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import { clockOf, lineParts } from './record-parts.ts';
import { useVoiceRecorder, type MicrophoneTrouble, type Take } from './use-voice-recorder.ts';

// One line of a recording question (plan 08 §8.7; ADR 0115, 25): the line with its stressed words in bold and a pause
// mark after each word to pause after, its target length, its example, and Record, then Play, Again, or Upload a file.
const props = defineProps<{ number: number; text: string; stress: readonly string[]; pauses: readonly string[]; seconds?: number | undefined; example?: string | undefined; disabled: boolean }>();
const emit = defineEmits<{ take: [take: Take | undefined]; trouble: [trouble: MicrophoneTrouble] }>();
const kvman = useKvman();
const recorder = useVoiceRecorder();
const parts = computed(() => lineParts(props.text, props.stress, props.pauses));
const picker = ref<HTMLInputElement | null>(null);
const player = ref<HTMLAudioElement | null>(null);

watch(recorder.take, (take) => emit('take', take));
watch(recorder.trouble, (trouble) => {
  if (trouble !== undefined) emit('trouble', trouble);
});

function play(url: string): void {
  if (player.value === null) return;
  player.value.src = url;
  void player.value.play();
}

async function chosen(event: Event): Promise<void> {
  const input = event.target;
  const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
  if (file !== undefined && !(await recorder.chosen(file))) kvman.toast('kvcoder.ui.record.notSound', { name: file.name }, 'error');
}
</script>

<template>
  <li class="kvc-record-line" :data-test="`record-line-${props.number}`">
    <p class="kvc-record-text" dir="auto" data-test="record-text">
      <template v-for="(part, index) in parts" :key="index">
        <strong v-if="part.stress" data-test="record-stress">{{ part.text }}</strong>
        <template v-else>{{ part.text }}</template>
        <span v-if="part.pause" class="kvc-record-pause" :title="kvman.t('kvcoder.ui.record.pause')" data-test="record-pause">|</span>
      </template>
    </p>
    <div class="kvc-record-controls">
      <span v-if="props.seconds !== undefined" class="kvc-muted" data-test="record-seconds">{{ kvman.t('kvcoder.ui.record.about', { count: props.seconds }) }}</span>
      <button v-if="props.example !== undefined" type="button" class="kvc-button kvc-ghost" data-test="record-example" @click="play(props.example)"><Volume2 :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.record.example') }}</button>
      <template v-if="recorder.countdown.value > 0">
        <span class="kvc-record-countdown" role="status" data-test="record-countdown">{{ recorder.countdown.value }}</span>
      </template>
      <template v-else-if="recorder.recording.value">
        <span class="kvc-record-meter" aria-hidden="true"><span :style="{ inlineSize: `${Math.round(recorder.level.value * 100)}%` }" /></span>
        <span role="status" data-test="record-time">{{ kvman.t('kvcoder.ui.record.recording', { time: clockOf(recorder.elapsedMs.value) }) }}</span>
        <button type="button" class="kvc-button" data-test="record-stop" @click="recorder.stop()"><Square :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.record.stop') }}</button>
      </template>
      <template v-else-if="recorder.take.value !== undefined">
        <span class="kvc-chip" data-test="record-take">{{ kvman.t('kvcoder.ui.record.take', { time: clockOf(recorder.take.value.durationMs) }) }}</span>
        <button type="button" class="kvc-button kvc-ghost" data-test="record-play" @click="play(recorder.take.value.url)"><Play :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.record.play') }}</button>
        <button type="button" class="kvc-button kvc-ghost" :disabled="props.disabled" data-test="record-again" @click="recorder.record()"><RotateCcw :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.record.again') }}</button>
      </template>
      <button v-else type="button" class="kvc-button kvc-primary" :disabled="props.disabled" data-test="record-start" @click="recorder.record()"><Mic :size="16" aria-hidden="true" /><Circle :size="10" aria-hidden="true" class="kvc-danger" />{{ kvman.t('kvcoder.ui.record.record') }}</button>
      <button type="button" class="kvc-button kvc-ghost" :disabled="props.disabled || recorder.recording.value" data-test="record-upload" @click="picker?.click()"><Upload :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.record.upload') }}</button>
      <input ref="picker" type="file" accept="audio/*" hidden data-test="record-file" @change="chosen" />
    </div>
    <audio ref="player" hidden />
  </li>
</template>
