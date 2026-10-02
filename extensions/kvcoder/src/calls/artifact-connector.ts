import { ProblemError, z, type Ctx, type Problem } from '@kvman/sdk';
import { builtinHelp, callInput, errorOutput, jsonOutput, type CallResult, type JsonValue } from '../connector-line.ts';
import { invalidInput } from './invalid-input.ts';
import { applyEdits } from '../files/edit-text.ts';
import { inOrder } from '../files/file-queue.ts';
import { notFound, tooLarge } from '../problems.ts';
import { kebab } from '../schemas/registry.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { artifactCountLimit, assertWithinLimit } from '../artifacts/artifact-records.ts';
import { withBody } from './write-body.ts';

// The `artifact` connector (plan 08 §8.5, ADR 0009, 173 to 176): `write` creates or replaces the chat's document,
// `edit` replaces text in one, `get` reads one. It runs in the step, with no approval asked.

const idMessage = 'An artifact id is lowercase kebab case, such as plan or login-design, up to 50 characters.';

const artifactId = z.string().max(50, idMessage).regex(kebab, idMessage);

const inputSchemas = {
  write: z.strictObject({ id: artifactId, title: z.string().min(1).max(100), format: z.enum(['markdown', 'html']).optional().default('markdown'), content: z.string().min(1) }),
  edit: z.strictObject({ id: artifactId, edits: z.array(z.strictObject({ oldText: z.string(), newText: z.string() })).min(1) }),
  get: z.strictObject({ id: artifactId }),
};

type WriteInput = z.output<typeof inputSchemas.write>;
type EditInput = z.output<typeof inputSchemas.edit>;

type Done = CallResult & { details: JsonValue };

const failed = (problem: Pick<Problem, 'code' | 'message'>): Done => ({ ...errorOutput(problem), details: null });

const missing = (id: string): ProblemError => notFound(`The artifact ${id} doesn't exist.`, { id });

async function writeArtifact(ctx: Ctx, chatId: string, input: WriteInput): Promise<Done> {
  const stored = await ctx.store.transaction((tx) => {
    assertWithinLimit(input.id, input.content);
    const artifacts = txRecords(tx).artifacts;
    const existing = artifacts.find({ sessionId: chatId, artifactId: input.id }, { limit: 1 })[0];
    const stamp = now();
    if (existing === undefined) {
      if (artifacts.count({ sessionId: chatId }) >= artifactCountLimit) throw tooLarge(`The chat holds at most ${artifactCountLimit} artifacts.`, artifactCountLimit);
      artifacts.insert({ sessionId: chatId, artifactId: input.id, title: input.title, format: input.format, content: input.content, version: 1, createdAt: stamp, updatedAt: stamp });
      return { version: 1, created: true };
    }
    artifacts.update(existing.id, { title: input.title, format: input.format, content: input.content, version: existing.version + 1, updatedAt: stamp });
    return { version: existing.version + 1, created: false };
  });
  return { ...jsonOutput({ id: input.id, version: stored.version, created: stored.created, bytes: Buffer.byteLength(input.content) }), details: { artifact: { id: input.id, title: input.title, format: input.format, version: stored.version } } };
}

async function editArtifact(ctx: Ctx, chatId: string, input: EditInput): Promise<Done> {
  const stored = await ctx.store.transaction((tx) => {
    const artifacts = txRecords(tx).artifacts;
    const existing = artifacts.find({ sessionId: chatId, artifactId: input.id }, { limit: 1 })[0];
    if (existing === undefined) throw missing(input.id);
    const edited = applyEdits(existing.content, input.edits);
    assertWithinLimit(input.id, edited.text);
    artifacts.update(existing.id, { content: edited.text, version: existing.version + 1, updatedAt: now() });
    return { version: existing.version + 1, title: existing.title, format: existing.format, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine };
  });
  return {
    ...jsonOutput({ id: input.id, version: stored.version, replacements: stored.replacements, firstChangedLine: stored.firstChangedLine }),
    details: { artifact: { id: input.id, title: stored.title, format: stored.format, version: stored.version } },
  };
}

async function readArtifact(ctx: Ctx, chatId: string, input: z.output<typeof inputSchemas.get>): Promise<Done> {
  const found = (await records(ctx.store).artifacts.find({ sessionId: chatId, artifactId: input.id }, { limit: 1 }))[0];
  if (found === undefined) throw missing(input.id);
  return { ...jsonOutput({ id: input.id, title: found.title, format: found.format, version: found.version, content: found.content }), details: null };
}

async function run(ctx: Ctx, chatId: string, command: 'write' | 'edit' | 'get', input: Record<string, unknown>): Promise<Done> {
  try {
    if (command === 'write') return await writeArtifact(ctx, chatId, inputSchemas.write.parse(input));
    if (command === 'edit') return await editArtifact(ctx, chatId, inputSchemas.edit.parse(input));
    return await readArtifact(ctx, chatId, inputSchemas.get.parse(input));
  } catch (error) {
    if (error instanceof ProblemError) return failed(error.problem);
    throw error;
  }
}

/** An `artifact` call of the chat `chatId`: its result now, after the calls before it on the same artifact. */
export function artifactCall(ctx: Ctx, chatId: string, words: readonly string[], stdin: string | null): Promise<Done> {
  if (words.length === 1 && words[0] === '-h') return Promise.resolve({ output: builtinHelp.artifact, exitCode: 0, details: null });
  const body = withBody(words, stdin);
  if ('output' in body) return Promise.resolve({ ...body, details: null });
  const call = callInput(body.words, body.stdin, 'artifact');
  if ('output' in call) return Promise.resolve({ ...call, details: null });
  const command = call.command;
  if (command !== 'write' && command !== 'edit' && command !== 'get') return Promise.resolve(failed({ code: 'NOT_FOUND', message: `artifact has no command ${command}; run \`artifact -h\`.` }));
  const parsed = inputSchemas[command].safeParse(call.input);
  if (!parsed.success) return Promise.resolve({ ...invalidInput('artifact', command, parsed.error.issues), details: null });
  return inOrder(`artifact:${chatId}:${parsed.data.id}`, () => run(ctx, chatId, command, parsed.data));
}
