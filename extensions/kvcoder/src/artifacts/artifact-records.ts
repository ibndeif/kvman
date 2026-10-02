import { tooLarge } from '../problems.ts';
import type { SessionDoc } from '../schemas/records.ts';

// The `artifact` connector's store (plan 08 §8.5, ADR 0009, 173 to 176): an artifact belongs to its chat, so a
// subagent's belongs to the chat at its root. Depth is 1, so the parent is the chat itself.

/** The bytes of content one artifact holds at most. */
export const artifactContentLimit = 65536;

/** The artifacts one chat holds at most. */
export const artifactCountLimit = 20;

/** The chat an artifact belongs to: the session's own id, or its parent's for a subagent. */
export function chatIdOf(session: Pick<SessionDoc, 'parentId'> & { id: string }): string {
  return session.parentId ?? session.id;
}

/** Fails `TOO_LARGE` when an artifact's content passes the limit. */
export function assertWithinLimit(id: string, content: string): void {
  if (Buffer.byteLength(content) > artifactContentLimit) throw tooLarge(`The artifact ${id} is over ${artifactContentLimit} bytes.`, artifactContentLimit);
}
