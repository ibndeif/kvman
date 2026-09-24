import { limits, jsonByteLength, type Message, type OutboundSend, type Priority } from '@kvman/protocol';
import type { Sender } from '../storage/commit-unit.ts';
import { priorityCodes } from '../storage/message-rows.ts';
import { invalid } from './refusal.ts';

const kernelSetKeys = ['locale'] as const;

function lower(requested: Priority, ceiling: Priority): Priority {
  return priorityCodes[requested] >= priorityCodes[ceiling] ? requested : ceiling;
}

// 02 §2.6: people start interactive chains, processes and kernel roots run normal, handlers pass their own class
// on; a sender may only lower it, and a request for a higher class is lowered silently.
export function assignPriority(sender: Sender, cause: Message | undefined, requested: Priority | undefined): Priority {
  const inherited = cause?.priority ?? (sender.address.startsWith('user:') ? 'interactive' : 'normal');
  return requested === undefined ? inherited : lower(requested, inherited);
}

// 02 §2.10: the context is inherited; additions may add keys and change inherited ones, never a kernel-set key
// such as the locale (ADR 0054). A message that inherits no locale gets the user's language.
export function assignContext(cause: Message | undefined, additions: Record<string, string> | undefined, defaultLocale: string): Record<string, string> {
  const kernelSet: Record<string, string> = { locale: cause?.context['locale'] ?? defaultLocale };
  for (const key of kernelSetKeys) {
    const added = additions?.[key];
    if (added !== undefined && added !== kernelSet[key]) throw invalid(`context.${key}`, `${key} is set by the kernel and cannot be changed`);
  }
  const context = { ...cause?.context, ...additions, ...kernelSet };
  if (jsonByteLength(context) > limits.contextBytes) throw invalid('context', `the context is over ${limits.contextBytes} bytes`);
  return context;
}

export function assignNotBefore(send: OutboundSend, now: number): number | undefined {
  if (send.delayMs !== undefined && send.at !== undefined) throw invalid('delayMs', 'a send has at most one of delayMs and at');
  if (send.delayMs !== undefined) return now + send.delayMs;
  return send.at;
}
