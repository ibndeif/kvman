import type { Kvman } from '@kvman/sdk/web';
import { toastProblem } from './kvman.ts';
import type { Thinking } from './model-groups.ts';
import { rememberModel } from './remember-model.ts';

// What the person does to the open chat (plan 08 §8.7), from its menu, its send box, or a slash command: each runs its
// command, says `changed` so the chat is read again, and toasts a Problem.
export function useSessionActions(kvman: Kvman, sessionId: () => string, changed: () => void) {
  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      changed();
    } catch (error) {
      toastProblem(kvman, error);
    }
  }
  return {
    configure: (change: { model?: string; thinking?: Thinking }) =>
      run(async () => {
        await kvman.exec('kvcoder.session.configure', { sessionId: sessionId(), ...change });
        if (change.model !== undefined) await rememberModel(kvman, change.model);
      }),
    rename: (title: string) =>
      run(async () => {
        if (title.trim() !== '') await kvman.exec('kvcoder.session.rename', { sessionId: sessionId(), title: title.trim() });
      }),
    fork: () => run(async () => kvman.navigate('kvcoder.session', { sessionId: (await kvman.exec('kvcoder.session.fork', { sessionId: sessionId() })).id })),
    exportFile: () =>
      run(async () => {
        const { fileId } = await kvman.exec('kvcoder.session.export', { sessionId: sessionId() });
        window.location.assign(`/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`);
      }),
    compact: () => run(async () => void (await kvman.exec('kvcoder.session.compact', { sessionId: sessionId() }))),
    remove: () =>
      run(async () => {
        await kvman.exec('kvcoder.session.delete', { sessionId: sessionId() });
        kvman.navigate('kvcoder.chat');
      }),
  };
}
