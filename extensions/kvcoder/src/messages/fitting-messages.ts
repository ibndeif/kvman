// `kvcoder.message.list` never fails for its size (plan 08 §8.1; ADR 0033, 1 and 3): it returns the newest messages
// that fit in its output limit, and counts the others as omitted.

/** The most a registration's output may be (plan 02 §2.13). */
export const listOutputBytes = 32 * 1024 * 1024;

/** A value's size as the kernel measures a job's output: the UTF-8 bytes of its JSON. */
export const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '');

/** The newest of `messages`, which are oldest first, whose JSON fits in `roomBytes`; the newest one is always kept. */
export function newestThatFit<Item>(messages: readonly Item[], roomBytes: number): Item[] {
  let room = roomBytes;
  let first = messages.length;
  while (first > 0) {
    room -= jsonBytes(messages[first - 1]) + 1;
    if (room < 0 && first < messages.length) break;
    first -= 1;
  }
  return messages.slice(first);
}
