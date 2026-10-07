// A reply's calls and their results stay together (ADR 0036, 16): a provider refuses a tool result whose call it
// wasn't sent. A step's results are stored right after the reply that made the calls, so a run of results belongs to
// the message before it.

type Kinded = { kind: string };

/** How many of `messages` are older than the newest `keep`: the kept ones never start at a tool result, so they start at its reply. */
export function olderCount(messages: readonly Kinded[], keep: number): number {
  let count = Math.max(messages.length - keep, 0);
  while (count > 0 && messages[count]?.kind === 'toolResult') count -= 1;
  return count;
}

/** `messages` with, when they start at a tool result, the reply that made its call and that reply's results from `before`, the messages right before them. */
export function withCallingReply<Message extends Kinded>(before: readonly Message[], messages: readonly Message[]): Message[] {
  if (messages[0]?.kind !== 'toolResult') return [...messages];
  const reply = before.findLastIndex((message) => message.kind !== 'toolResult');
  return before[reply]?.kind === 'assistant' ? [...before.slice(reply), ...messages] : [...messages];
}
