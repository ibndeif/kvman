import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { recorderType, takeType } from './record-parts.ts';

// Recording one take in the browser (plan 08 §8.7; ADR 0115, 25 and 29): a 3-2-1 countdown, then `MediaRecorder` on the
// microphone with a level from 0 to 1 and the time so far, stopping by itself at 60 s. A microphone that can't be
// opened, or is refused, is said so; the page's own timers end with the card.

export type Take = { blob: Blob; type: string; durationMs: number; url: string };

export type MicrophoneTrouble = 'unavailable' | 'refused';

const longestMs = 60_000;

export function useVoiceRecorder() {
  const countdown = ref(0);
  const recording = ref(false);
  const level = ref(0);
  const elapsedMs = ref(0);
  const trouble = ref<MicrophoneTrouble | undefined>(undefined);
  const take = shallowRef<Take | undefined>(undefined);
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let timers: ReturnType<typeof setInterval>[] = [];
  let audio: AudioContext | undefined;
  let frame = 0;

  const stopTimers = (): void => {
    for (const timer of timers) clearInterval(timer);
    timers = [];
    cancelAnimationFrame(frame);
  };
  const release = (): void => {
    stopTimers();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    void audio?.close();
    audio = undefined;
    level.value = 0;
  };

  function measure(source: MediaStream): void {
    if (typeof AudioContext === 'undefined') return;
    audio = new AudioContext();
    const analyser = audio.createAnalyser();
    audio.createMediaStreamSource(source).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const tick = (): void => {
      analyser.getByteTimeDomainData(samples);
      level.value = Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length) * 3);
      frame = requestAnimationFrame(tick);
    };
    tick();
  }

  function begin(source: MediaStream): void {
    const type = recorderType((candidate) => MediaRecorder.isTypeSupported(candidate));
    recorder = type === undefined ? new MediaRecorder(source) : new MediaRecorder(source, { mimeType: type });
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
    recorder.addEventListener('stop', () => {
      const durationMs = Math.min(longestMs + 1000, Math.max(1, Date.now() - startedAt));
      const kind = takeType(recorder?.mimeType ?? type ?? '') ?? 'audio/webm';
      const blob = new Blob(chunks, { type: kind });
      if (take.value !== undefined) URL.revokeObjectURL(take.value.url);
      take.value = { blob, type: kind, durationMs, url: URL.createObjectURL(blob) };
      recording.value = false;
      release();
    });
    recorder.start();
    recording.value = true;
    elapsedMs.value = 0;
    measure(source);
    timers.push(setInterval(() => {
      elapsedMs.value = Date.now() - startedAt;
      if (elapsedMs.value >= longestMs) stop();
    }, 200));
  }

  async function record(): Promise<void> {
    trouble.value = undefined;
    if (navigator.mediaDevices?.getUserMedia === undefined || typeof MediaRecorder === 'undefined') {
      trouble.value = 'unavailable';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      trouble.value = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'refused' : 'unavailable';
      return;
    }
    const opened = stream;
    countdown.value = 3;
    timers.push(setInterval(() => {
      countdown.value -= 1;
      if (countdown.value > 0) return;
      stopTimers();
      begin(opened);
    }, 1000));
  }

  function stop(): void {
    if (recorder?.state === 'recording') recorder.stop();
  }

  /** A take from a file the person chose, its length read from the file. */
  async function chosen(file: File): Promise<boolean> {
    const type = takeType(file.type);
    if (type === undefined) return false;
    const url = URL.createObjectURL(file);
    const durationMs = await new Promise<number>((resolve) => {
      const player = new Audio();
      player.addEventListener('loadedmetadata', () => resolve(Number.isFinite(player.duration) ? Math.max(1, Math.round(player.duration * 1000)) : 1));
      player.addEventListener('error', () => resolve(1));
      player.src = url;
    });
    if (take.value !== undefined) URL.revokeObjectURL(take.value.url);
    take.value = { blob: file, type, durationMs: Math.min(durationMs, longestMs + 1000), url };
    return true;
  }

  onBeforeUnmount(() => {
    stop();
    release();
    if (take.value !== undefined) URL.revokeObjectURL(take.value.url);
  });

  return { countdown, recording, level, elapsedMs, trouble, take, record, stop, chosen };
}
