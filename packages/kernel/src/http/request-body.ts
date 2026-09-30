import { open, rm } from 'node:fs/promises';
import { jsonSchema, z, type Problem } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { validationFailed } from '../store/json-values.ts';

// Request bodies (plan 04 §4.1, ADR 0009, 39 and 40): read no further than the limit, and parsed strictly.

function tooLarge(limit: number): Error {
  return kernelProblem('TOO_LARGE', `The request body is over ${limit} bytes.`, { limit });
}

function declaredOver(request: Request, limit: number): boolean {
  const declared = Number(request.headers.get('content-length') ?? '0');
  return Number.isFinite(declared) && declared > limit;
}

// Each chunk of the body, failing TOO_LARGE as soon as the total passes the limit (the rest is never read).
async function* cappedChunks(request: Request, limit: number): AsyncGenerator<Uint8Array> {
  if (declaredOver(request, limit)) throw tooLarge(limit);
  const reader = request.body?.getReader();
  if (reader === undefined) return;
  let total = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge(limit);
    }
    yield read.value;
  }
}

export async function readCapped(request: Request, limit: number): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of cappedChunks(request, limit)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Streams the body into a new file; a body over the limit, or any failure, leaves no file behind.
export async function writeCapped(request: Request, limit: number, file: string): Promise<void> {
  const handle = await open(file, 'wx');
  try {
    for await (const chunk of cappedChunks(request, limit)) await handle.write(chunk);
    await handle.close();
  } catch (error) {
    await handle.close();
    await rm(file, { force: true });
    throw error;
  }
}

const commandBodySchema = z.strictObject({ input: jsonSchema, workspaceId: z.string().min(1).optional(), async: z.boolean().optional() });
const queryBodySchema = commandBodySchema.omit({ async: true });

export type CallBody = { input: unknown; workspaceId: string | undefined; async: boolean };

export type ParsedBody = { kind: 'call'; call: CallBody } | { kind: 'not-json' } | { kind: 'invalid'; problem: Problem };

function parsedJson(bytes: Uint8Array): { json: unknown } | undefined {
  try {
    return { json: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return undefined;
  }
}

// A command's body is `{ input, workspaceId?, async? }`, a query's has no `async`; unknown keys fail.
export function parseCallBody(bytes: Uint8Array, kind: 'command' | 'query'): ParsedBody {
  const parsed = parsedJson(bytes);
  if (parsed === undefined) return { kind: 'not-json' };
  const body = (kind === 'command' ? commandBodySchema : queryBodySchema).safeParse(parsed.json);
  if (!body.success) {
    const error = validationFailed('The request body', body.error);
    return { kind: 'invalid', problem: error.problem };
  }
  return { kind: 'call', call: { input: body.data.input, workspaceId: body.data.workspaceId, async: 'async' in body.data && body.data.async === true } };
}
