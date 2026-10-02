import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai';
import { z } from '@kvman/sdk';
import type { Delta } from '../schemas/complete.ts';

// What kvai reports of a stream (plan 07 §7.1): text and thinking as they come, and a tool call's name when it starts,
// then its arguments as they complete (ADR 0009, 144): every key but the one being written, and all of them at the end.

const argumentsSchema = z.record(z.string(), z.json());

function toolCallAt(message: AssistantMessage, index: number) {
  const block = message.content[index];
  return block?.type === 'toolCall' ? block : undefined;
}

/** Makes the reader of one model call's events; it remembers how many arguments each call has already reported. */
export function createDeltaReader(): (event: AssistantMessageEvent) => Delta | undefined {
  const reported = new Map<number, number>();

  function argumentsDone(name: string, index: number, values: Record<string, unknown>, keys: readonly string[]): Delta | undefined {
    if (keys.length <= (reported.get(index) ?? 0)) return undefined;
    reported.set(index, keys.length);
    return { type: 'toolcall', name, arguments: argumentsSchema.parse(Object.fromEntries(keys.map((key) => [key, values[key]]))) };
  }

  return (event) => {
    if (event.type === 'text_delta') return { type: 'text', delta: event.delta };
    if (event.type === 'thinking_delta') return { type: 'thinking', delta: event.delta };
    if (event.type === 'toolcall_start') {
      const block = toolCallAt(event.partial, event.contentIndex);
      return block === undefined ? undefined : { type: 'toolcall', name: block.name };
    }
    if (event.type === 'toolcall_delta') {
      const block = toolCallAt(event.partial, event.contentIndex);
      return block === undefined ? undefined : argumentsDone(block.name, event.contentIndex, block.arguments, Object.keys(block.arguments).slice(0, -1));
    }
    if (event.type === 'toolcall_end') return argumentsDone(event.toolCall.name, event.contentIndex, event.toolCall.arguments, Object.keys(event.toolCall.arguments));
    return undefined;
  };
}
