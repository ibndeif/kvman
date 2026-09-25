import type { Message } from '@kvman/protocol';

// 02 §2.9: each attempt gets a fresh handler timeout; the message deadline stays fixed.
export const defaultTimeoutsMs = { command: 60_000, event: 30_000, query: 5_000 } as const;

export function invocationDeadline(message: Message, timeoutMs: number | undefined, claimedAt: number): number {
  const timeout = claimedAt + (timeoutMs ?? defaultTimeoutsMs[message.kind]);
  return message.deadlineAt === undefined ? timeout : Math.min(message.deadlineAt, timeout);
}
