import type { Ctx } from '@kvman/sdk';
import { localLinks } from '../jobs/process-text.ts';
import type { ArtifactDoc } from '../schemas/records.ts';
import { records, txRecords } from '../store/collections.ts';
import { chatIdOf } from './artifact-records.ts';

// The url artifacts a background process served (ADR 0104): its chat's whose port is the port of a localhost link the
// process printed. They are deleted when it ends, since nothing serves them now. Both hosts are this machine, so only
// the port is compared.

function portOf(address: string): string {
  const url = new URL(address);
  return url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
}

/** The ids, in order, of the url artifacts at the port of one of `links`. */
export function servedIds(artifacts: readonly Pick<ArtifactDoc, 'artifactId' | 'format' | 'content'>[], links: readonly string[]): string[] {
  const ports = new Set(links.map(portOf));
  return artifacts
    .filter((artifact) => artifact.format === 'url' && ports.has(portOf(artifact.content)))
    .map((artifact) => artifact.artifactId)
    .sort();
}

/** Deletes the url artifacts of the session's chat that `output` printed the port of, and gives their ids in order. */
export async function deleteServedArtifacts(ctx: Ctx, sessionId: string, output: string): Promise<string[]> {
  const links = localLinks(output);
  if (links.length === 0) return [];
  const session = await records(ctx.store).sessions.get(sessionId);
  if (session === undefined) return [];
  const chatId = chatIdOf(session);
  return ctx.store.transaction((tx) => {
    const artifacts = txRecords(tx).artifacts;
    const found = artifacts.find({ sessionId: chatId }, { limit: 1000 });
    const ids = new Set(servedIds(found, links));
    for (const artifact of found) if (ids.has(artifact.artifactId)) artifacts.delete(artifact.id);
    return [...ids];
  });
}

/** The line that tells the agent which artifacts went, or nothing when none did. */
export function deletedArtifactsText(ids: readonly string[]): string {
  const names = ids.map((id) => `\`${id}\``).join(', ');
  if (ids.length === 0) return '';
  return ids.length === 1 ? `Its artifact ${names} was deleted, since nothing serves its address now.` : `Its artifacts ${names} were deleted, since nothing serves their address now.`;
}
