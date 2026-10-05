import { z, type Ctx } from '@kvman/sdk';
import { artifactFormats, contentFor, detectFormat } from '../artifacts/artifact-format.ts';
import { artifactCountLimit, assertWithinLimit, chatIdOf } from '../artifacts/artifact-records.ts';
import { applyEdits } from '../files/edit-text.ts';
import { notFound, tooLarge } from '../problems.ts';
import { kebab } from '../schemas/registry.ts';
import { findSession, now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { edits } from './payload-fields.ts';

// The `artifact` connector (plan 08 §8.5, ADR 0009, 173 to 176): `write` creates or replaces the chat's document,
// `edit` replaces text in one, `get` reads one. No approval is asked, and the step runs the calls on one artifact one
// after another.

/** What the prompt's index says the connector is for. */
export const artifactDescription =
  'Show the person something to read or see: a plan, a report, a design, an HTML page, or the localhost address of an app you are running (format url). Use it for anything longer than a few lines instead of pasting it into a reply, and keep your plan in the artifact `plan`. The panel runs the page of an HTML artifact in a sandbox where localStorage, sessionStorage, cookies, and indexedDB throw, so a page you show that way must work without them, keeping its state in memory or wrapping each use in try/catch; a url artifact is a normal page on its own address and can use them.';

const idMessage = 'An artifact id is lowercase kebab case, such as plan or login-design, up to 50 characters.';

const artifactId = z.string().max(50, idMessage).regex(kebab, idMessage).describe('The name of the artifact within this chat, in lowercase kebab case, up to 50 characters, such as plan.');

const payloads = {
  write: z.strictObject({
    id: artifactId,
    title: z.string().min(1).max(100).describe('The title the person sees, up to 100 characters.'),
    format: z.enum(artifactFormats).describe('markdown, html, or url. Left out, a page that starts with <!doctype html or <html is html, a lone localhost address is url, and anything else markdown.').exactOptional(),
    content: z.string().min(1).describe('The whole content, up to 64 KB.'),
  }),
  edit: z.strictObject({ id: artifactId, edits }),
  get: z.strictObject({ id: artifactId }),
};

const writeNotes =
  'The content is up to 64 KB, and a chat holds up to 20 artifacts. An "html" artifact is one self-contained page: its scripts run, but it can load nothing from the network (no external scripts, styles, images, or fonts: use inline CSS and JS, data: images, or inline SVG) and can\'t reach the rest of the app. A "url" artifact shows an app running on this machine, such as a dev server you started: its content is one http or https address on localhost or 127.0.0.1, shown in a scripts-only frame.';

export const artifactCommands = {
  write: { registration: 'kvcoder.artifact.write', description: 'Creates an artifact, or replaces its title, format, and content.', payload: payloads.write, asks: false, notes: writeNotes },
  edit: { registration: 'kvcoder.artifact.edit', description: 'Replaces exact pieces of text in an existing artifact; if one replacement fails, nothing changes.', payload: payloads.edit, asks: false },
  get: { registration: 'kvcoder.artifact.content.get', description: 'Reads an artifact with its content.', payload: payloads.get, asks: false },
} satisfies Record<string, ConnectorCommand>;

type WriteInput = z.output<typeof payloads.write>;
type EditInput = z.output<typeof payloads.edit>;

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

const commands = artifactCommands;

export function registerArtifactConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.artifact.write', {
    description: commands.write.description,
    input: callInput(payloads.write),
    output: z.object({ id: z.string(), version: z.number().int(), created: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => writeArtifact(ctx, await chatOf(ctx, sessionId), payload),
  });
  ctx.registerCommand('kvcoder.artifact.edit', {
    description: commands.edit.description,
    input: callInput(payloads.edit),
    output: z.object({ id: z.string(), version: z.number().int(), replacements: z.number().int(), firstChangedLine: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => editArtifact(ctx, await chatOf(ctx, sessionId), payload),
  });
  ctx.registerQuery('kvcoder.artifact.content.get', {
    description: commands.get.description,
    input: callInput(payloads.get),
    output: z.object({ id: z.string(), title: z.string(), format: z.enum(artifactFormats), version: z.number().int(), content: z.string() }),
    handle: async ({ sessionId, payload }) => {
      const found = (await records(ctx.store).artifacts.find({ sessionId: await chatOf(ctx, sessionId), artifactId: payload.id }, { limit: 1 }))[0];
      if (found === undefined) throw missing(payload.id);
      return { id: payload.id, title: found.title, format: found.format, version: found.version, content: found.content };
    },
  });
}
