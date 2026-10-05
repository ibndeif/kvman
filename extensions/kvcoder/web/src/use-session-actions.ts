import { shallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { toastProblem } from './kvman.ts';
import type { Thinking } from './model-groups.ts';
import { rememberModel } from './remember-model.ts';

// What the person does to the open chat (plan 08 §8.7), from its menu, its send box, or a slash command: each runs its
// command, says `changed` so the chat is read again, and toasts a Problem. The four that wait for kvman are `working`
// from their start to their end, one at a time: a second one started meanwhile does nothing (ADR 0019, 2 and 3).
export type WaitingAction = 'compact' | 'export' | 'fork' | 'rename';
export type Working = { name: WaitingAction; startedAt: number };

export function useSessionActions(kvman: Kvman, sessionId: () => string, changed: () => unknown) {
  const working = shallowRef<Working>();

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      await changed();
    } catch (error) {
      toastProblem(kvman, error);
    }
  }

  async function wait(name: WaitingAction, action: () => Promise<void>): Promise<void> {
    if (working.value !== undefined) return;
    working.value = { name, startedAt: Date.now() };
    try {
      await run(action);
    } finally {
      working.value = undefined;
    }
  }

  // Whether a summary was made, or nothing when the command failed.
  async function compact(): Promise<boolean | undefined> {
    let summarized: boolean | undefined;
    await wait('compact', async () => void (summarized = (await kvman.exec('kvcoder.session.compact', { sessionId: sessionId() })).summarized));
    return summarized;
  }

  return {
    working,
    compact,
    configure: (change: { model?: string; thinking?: Thinking }) =>
      run(async () => {
        await kvman.exec('kvcoder.session.configure', { sessionId: sessionId(), ...change });
        if (change.model !== undefined) await rememberModel(kvman, change.model);
      }),
    rename: (title: string) =>
      wait('rename', async () => {
        if (title.trim() !== '') await kvman.exec('kvcoder.session.rename', { sessionId: sessionId(), title: title.trim() });
      }),
    fork: () => wait('fork', async () => kvman.navigate('kvcoder.session', { sessionId: (await kvman.exec('kvcoder.session.fork', { sessionId: sessionId() })).id })),
    exportFile: () =>
      wait('export', async () => {
        const { fileId } = await kvman.exec('kvcoder.session.export', { sessionId: sessionId() });
        window.location.assign(`/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`);
      }),
    remove: () =>
      run(async () => {
        await kvman.exec('kvcoder.session.delete', { sessionId: sessionId() });
        kvman.navigate('kvcoder.chat');
      }),
  };
}
