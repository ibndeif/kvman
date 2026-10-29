import { connect } from 'node:net';
import type { Ctx } from '@kvman/sdk';
import { records } from '../store/collections.ts';
import { artifactCountLimit } from './artifact-records.ts';

// At the artifact limit, a new url artifact takes the place of the chat's oldest url artifact whose server has stopped
// (plan 08 §8.5, ADR 0108, 18): one whose address nothing answers on now, so it shows nothing anyway.

const answerWithinMs = 1_000;

// Whether something on this machine accepts a connection at the address's port.
function answers(address: string): Promise<boolean> {
  const url = new URL(address);
  const port = Number(url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80');
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port });
    const settle = (answered: boolean): void => { socket.destroy(); resolve(answered); };
    socket.setTimeout(answerWithinMs, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

/** The id of the url artifact a new one may replace in a full chat, oldest first; `undefined` when the chat isn't full or none has stopped. */
export async function endedUrlArtifact(ctx: Ctx, chatId: string, newId: string): Promise<string | undefined> {
  const artifacts = await records(ctx.store).artifacts.find({ sessionId: chatId }, { limit: 1000 });
  if (artifacts.length < artifactCountLimit || artifacts.some((artifact) => artifact.artifactId === newId)) return undefined;
  const urls = artifacts.filter((artifact) => artifact.format === 'url').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const artifact of urls) if (!(await answers(artifact.content))) return artifact.artifactId;
  return undefined;
}
