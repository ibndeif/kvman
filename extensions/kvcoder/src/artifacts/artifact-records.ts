import type { Ctx, Stored } from '@kvman/sdk';
import { tooLarge } from '../problems.ts';
import type { ArtifactDoc, SessionDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';

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

/** A chat's artifacts, newest change first, an artifact id breaking a tie. */
export async function chatArtifacts(ctx: Ctx, chatId: string): Promise<Stored<ArtifactDoc>[]> {
  return (await records(ctx.store).artifacts.find({ sessionId: chatId }, { limit: 1000 })).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.artifactId.localeCompare(second.artifactId));
}

/** Fails `TOO_LARGE` when an artifact's content passes the limit. */
export function assertWithinLimit(id: string, content: string): void {
  if (Buffer.byteLength(content) > artifactContentLimit) throw tooLarge(`The artifact ${id} is over ${artifactContentLimit} bytes.`, artifactContentLimit);
}
