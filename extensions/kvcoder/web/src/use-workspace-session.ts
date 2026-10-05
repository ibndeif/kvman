import type { Kvman } from '@kvman/sdk/web';
import { computed, shallowRef, watch, type ComputedRef } from 'vue';

// The open chat follows the tab's workspace (plan 08 §8.7, ADR 0016). A session exists only in its own workspace, and a
// workspace switch doesn't remount the page, so after one the page's `sessionId` names a chat the new workspace doesn't
// have. The id given here is `undefined` from the switch until the page has moved to that workspace's newest chat, or
// to a new chat when it has none, so nothing reads the old chat there.
export function useWorkspaceSession(kvman: Kvman, sessionId: () => string | undefined, failed: (error: unknown) => void): ComputedRef<string | undefined> {
  // The workspace the page's chat was opened in.
  const opened = shallowRef(kvman.workspace.value.id);

  async function move(workspaceId: string): Promise<void> {
    let newest: string | undefined;
    try {
      newest = (await kvman.exec('kvcoder.session.list', { limit: 1 }))[0]?.id;
    } catch (error) {
      if (kvman.workspace.value.id === workspaceId) failed(error);
    }
    if (kvman.workspace.value.id !== workspaceId) return;
    if (newest === undefined) kvman.navigate('kvcoder.chat');
    else kvman.navigate('kvcoder.session', { sessionId: newest });
  }

  watch(sessionId, () => {
    opened.value = kvman.workspace.value.id;
  });
  watch(
    () => kvman.workspace.value.id,
    (workspaceId) => {
      if (sessionId() === undefined) opened.value = workspaceId;
      else void move(workspaceId);
    },
  );
  return computed(() => (opened.value === kvman.workspace.value.id ? sessionId() : undefined));
}
