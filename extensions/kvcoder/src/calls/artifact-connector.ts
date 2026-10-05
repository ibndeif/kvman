import { z, type Ctx } from '@kvman/sdk';
import { artifactFormats, contentFor, detectFormat } from '../artifacts/artifact-format.ts';
import { artifactCountLimit, assertWithinLimit, chatIdOf } from '../artifacts/artifact-records.ts';
import { applyEdits } from '../files/edit-text.ts';
import { notFound, tooLarge } from '../problems.ts';
import { callInput, payloads } from '../schemas/payloads.ts';
import { findSession, now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { builtinCommands } from './builtin-connectors.ts';

// The `artifact` connector (plan 08 §8.5, ADR 0009, 173 to 176): `write` creates or replaces the chat's document,
// `edit` replaces text in one, `get` reads one. No approval is asked, and the step runs the calls on one artifact one
// after another.

type WriteInput = z.output<typeof payloads.artifactWrite>;
type EditInput = z.output<typeof payloads.artifactEdit>;

const missing = (id: string) => notFound(`The artifact ${id} doesn't exist.`, { id });

// An artifact belongs to its chat, so a subagent's belongs to the chat at its root.
const chatOf = async (ctx: Ctx, sessionId: string): Promise<string> => chatIdOf(await findSession(ctx, sessionId));

function writeArtifact(ctx: Ctx, chatId: string, input: WriteInput) {
  const format = input.format ?? detectFormat(input.content);
  return ctx.store.transaction((tx) => {
    const content = contentFor(format, input.content);
    assertWithinLimit(input.id, content);
    const artifacts = txRecords(tx).artifacts;
    const existing = artifacts.find({ sessionId: chatId, artifactId: input.id }, { limit: 1 })[0];
    const stamp = now();
    if (existing === undefined) {
      if (artifacts.count({ sessionId: chatId }) >= artifactCountLimit) throw tooLarge(`The chat holds at most ${artifactCountLimit} artifacts.`, artifactCountLimit);
      artifacts.insert({ sessionId: chatId, artifactId: input.id, title: input.title, format, content, version: 1, createdAt: stamp, updatedAt: stamp });
      return { id: input.id, version: 1, created: true, bytes: Buffer.byteLength(content) };
    }
    artifacts.update(existing.id, { title: input.title, format, content, version: existing.version + 1, updatedAt: stamp });
    return { id: input.id, version: existing.version + 1, created: false, bytes: Buffer.byteLength(content) };
  });
}

function editArtifact(ctx: Ctx, chatId: string, input: EditInput) {
  return ctx.store.transaction((tx) => {
    const artifacts = txRecords(tx).artifacts;
    const existing = artifacts.find({ sessionId: chatId, artifactId: input.id }, { limit: 1 })[0];
    if (existing === undefined) throw missing(input.id);
    const edited = applyEdits(existing.content, input.edits);
    const text = contentFor(existing.format, edited.text);
    assertWithinLimit(input.id, text);
    artifacts.update(existing.id, { content: text, version: existing.version + 1, updatedAt: now() });
    return { id: input.id, version: existing.version + 1, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine };
  });
}

/** What the artifact card shows of a chat's artifact (ADR 0009, 177), or nothing when the chat has none by that id. */
export async function artifactCard(ctx: Ctx, sessionId: string, id: string): Promise<{ id: string; title: string; format: (typeof artifactFormats)[number]; version: number } | undefined> {
  const found = (await records(ctx.store).artifacts.find({ sessionId: await chatOf(ctx, sessionId), artifactId: id }, { limit: 1 }))[0];
  return found === undefined ? undefined : { id, title: found.title, format: found.format, version: found.version };
}

const commands = builtinCommands.artifact;

export function registerArtifactConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.artifact.write', {
    description: commands.write.description,
    input: callInput(payloads.artifactWrite),
    output: z.object({ id: z.string(), version: z.number().int(), created: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => writeArtifact(ctx, await chatOf(ctx, sessionId), payload),
  });
  ctx.registerCommand('kvcoder.artifact.edit', {
    description: commands.edit.description,
    input: callInput(payloads.artifactEdit),
    output: z.object({ id: z.string(), version: z.number().int(), replacements: z.number().int(), firstChangedLine: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => editArtifact(ctx, await chatOf(ctx, sessionId), payload),
  });
  ctx.registerQuery('kvcoder.artifact.content.get', {
    description: commands.get.description,
    input: callInput(payloads.artifactGet),
    output: z.object({ id: z.string(), title: z.string(), format: z.enum(artifactFormats), version: z.number().int(), content: z.string() }),
    handle: async ({ sessionId, payload }) => {
      const found = (await records(ctx.store).artifacts.find({ sessionId: await chatOf(ctx, sessionId), artifactId: payload.id }, { limit: 1 }))[0];
      if (found === undefined) throw missing(payload.id);
      return { id: payload.id, title: found.title, format: found.format, version: found.version, content: found.content };
    },
  });
}
