import type { Kvman } from '@kvman/sdk/web';
import { computed, type ComputedRef } from 'vue';
import { toastProblem } from './kvman.ts';
import { textOf } from './message-parts.ts';
import type { Conversation } from './use-conversation.ts';

// Presses in OpenUI (plan 08 §8.7, ADR 0124, 6): the lead's newest reply with text is the one whose UI can be pressed (a
// helper's chat has none), and a press sends the person's message as typed text does, steering a running turn, but apart
// from the send box, whose draft stays. Each press is its own send; a failed one says so in a toast.

export type Presses = { newestReply: ComputedRef<string | undefined>; press(text: string): Promise<void> };

export function usePresses(kvman: Kvman, sessionId: () => string | undefined, conversation: Conversation, followed: () => void): Presses {
  const newestReply = computed(() => {
    if (conversation.session.value?.parentId !== undefined) return undefined;
    return [...conversation.messages.value].reverse().find((message) => message.kind === 'assistant' && textOf(message.content['content']) !== '')?.id;
  });
  const press = async (text: string): Promise<void> => {
    const id = sessionId();
    if (id === undefined) return;
    try {
      await kvman.exec('kvcoder.message.send', { sessionId: id, text, sendId: crypto.randomUUID() });
      followed();
      await conversation.refresh();
    } catch (error) {
      toastProblem(kvman, error);
    }
  };
  return { newestReply, press };
}
