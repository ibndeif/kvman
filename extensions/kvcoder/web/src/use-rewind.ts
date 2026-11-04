import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Undone } from './rewind-parts.ts';

// A rewind from one of the person's messages (plan 08 §8.7, ADR 0118, 7): what it would do, read when the box opens, and
// the edit or the undo itself. An edit sent again keeps its `sendId`, so a repeat never rewinds twice.

export type Preview = { files: { path: string; state: 'restore' | 'delete' | 'changedSince' | 'tooLarge' }[]; messages: number; running: boolean };
export type Left = { path: string; reason: 'changedSince' | 'tooLarge' }[];
export type Edited = { text: string; fileIds: string[]; attachments: string[]; files: boolean };

export type Rewind = {
  preview: ShallowRef<Preview | undefined>;
  previewError: ShallowRef<unknown>;
  error: ShallowRef<unknown>;
  working: ShallowRef<boolean>;
  /** How many files a rewind with files would restore or delete. */
  changing: ComputedRef<number>;
  load(): Promise<void>;
  edit(edited: Edited): Promise<Left | undefined>;
  undo(files: boolean): Promise<(Undone & { left: Left }) | undefined>;
};

export function useRewind(kvman: Kvman, sessionId: () => string, seq: () => number): Rewind {
  const preview = shallowRef<Preview>();
  const previewError = shallowRef<unknown>();
  const error = shallowRef<unknown>();
  const working = shallowRef(false);
  const changing = computed(() => preview.value?.files.filter((file) => file.state === 'restore' || file.state === 'delete').length ?? 0);
  let attempt: { key: string; sendId: string } | undefined;

  async function load(): Promise<void> {
    previewError.value = undefined;
    try {
      preview.value = await kvman.exec('kvcoder.rewind.files.list', { sessionId: sessionId(), seq: seq() });
    } catch (failure) {
      previewError.value = failure;
    }
  }

  async function run<Value>(act: () => Promise<Value>): Promise<Value | undefined> {
    if (working.value) return undefined;
    working.value = true;
    error.value = undefined;
    try {
      return await act();
    } catch (failure) {
      error.value = failure;
      return undefined;
    } finally {
      working.value = false;
    }
  }

  async function edit(edited: Edited): Promise<Left | undefined> {
    const key = JSON.stringify(edited);
    attempt = attempt?.key === key ? attempt : { key, sendId: crypto.randomUUID() };
    const sendId = attempt.sendId;
    const done = await run(() => kvman.exec('kvcoder.message.edit', { sessionId: sessionId(), seq: seq(), text: edited.text, files: edited.files, sendId, ...(edited.fileIds.length > 0 ? { fileIds: edited.fileIds } : {}), ...(edited.attachments.length > 0 ? { attachments: edited.attachments } : {}) }));
    return done?.left;
  }

  async function undo(files: boolean): Promise<(Undone & { left: Left }) | undefined> {
    return run(() => kvman.exec('kvcoder.message.undo', { sessionId: sessionId(), files }));
  }

  return { preview, previewError, error, working, changing, load, edit, undo };
}
