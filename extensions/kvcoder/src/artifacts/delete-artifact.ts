import type { Ctx } from '@kvman/sdk';
import { ownerName } from '../jobs/process-records.ts';
import { notFound } from '../problems.ts';
import { allDocs } from '../store/all-docs.ts';
import { records, txRecords } from '../store/collections.ts';
import { appendBackground } from '../turns/background.ts';

// Deleting a chat's artifacts (ADR 0105): by the agent, the person, another extension, or the daily age limit. What the
// person or the age limit deleted is told to the agent in kvcoder's own message, which starts no turn (ADR 0105, 4 and 5).

const kvcoderSource = { kind: 'extension', name: ownerName } as const;

/** Deletes one artifact of the chat, failing `NOT_FOUND` for an unknown id; the person's delete is told to the agent. */
export async function deleteArtifact(ctx: Ctx, chatId: string, id: string): Promise<{ id: string; deleted: true }> {
  await ctx.store.transaction((tx) => {
    const artifacts = txRecords(tx).artifacts;
    const found = artifacts.find({ sessionId: chatId, artifactId: id }, { limit: 1 })[0];
    if (found === undefined) throw notFound(`The artifact ${id} doesn't exist.`, { id });
    artifacts.delete(found.id);
  });
  if (ctx.job.caller.kind === 'user') await appendBackground(ctx, chatId, kvcoderSource, `The person deleted the artifact \`${id}\`.`, false);
  return { id, deleted: true };
}

/** Deletes the artifacts of each idle chat not updated within `days` days, and tells each chat which went. */
export async function expireArtifacts(ctx: Ctx, days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const chats = new Set((await allDocs((options) => records(ctx.store).artifacts.find({}, options))).filter((artifact) => artifact.updatedAt < cutoff).map((artifact) => artifact.sessionId));
  for (const chatId of chats) {
    const deleted = await ctx.store.transaction((tx) => {
      const current = txRecords(tx);
      if (current.sessions.get(chatId)?.status !== 'idle') return [];
      const gone = current.artifacts.find({ sessionId: chatId }, { limit: 1000 }).filter((artifact) => artifact.updatedAt < cutoff);
      for (const artifact of gone) current.artifacts.delete(artifact.id);
      return gone.map((artifact) => artifact.artifactId).sort();
    });
    if (deleted.length > 0) await appendBackground(ctx, chatId, kvcoderSource, `Artifacts not updated in ${String(days)} days were deleted: ${deleted.map((id) => `\`${id}\``).join(', ')}.`, false);
  }
}
