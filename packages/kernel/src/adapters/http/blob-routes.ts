import { blobIdSchema, blobLimits, blobNameSchema, mimeTypeSchema, workspaceIdSchema, type BlobInfo } from '@kvman/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BlobTooLarge, type BlobIntake } from '../../blobs/blob-intake.ts';
import { attachment, imageServing, isInlineCandidate, sniffBytes, textServing, type Serving } from '../../blobs/blob-serving.ts';
import type { RouteContext } from './http-adapter.ts';
import { sendProblem } from './problem-replies.ts';

type Headers = { mime: string; name: string | undefined; workspaceId: string | undefined };

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function decoded(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

// ADR 0138: Content-Type defaults to application/octet-stream and keeps its essence; the file name is
// percent-encoded UTF-8; the workspace is optional.
function uploadHeaders(request: FastifyRequest): Headers | string {
  const type = header(request, 'content-type');
  const mime = mimeTypeSchema.safeParse(type === undefined ? 'application/octet-stream' : (type.split(';')[0] ?? '').trim().toLowerCase());
  if (!mime.success) return 'Content-Type is not a media type';
  const filename = header(request, 'x-kvman-filename');
  const name = filename === undefined ? undefined : blobNameSchema.safeParse(decoded(filename));
  if (name !== undefined && !name.success) return 'X-Kvman-Filename is not a percent-encoded file name of 1–255 characters';
  const workspace = header(request, 'x-kvman-workspace');
  const workspaceId = workspace === undefined ? undefined : workspaceIdSchema.safeParse(workspace);
  if (workspaceId !== undefined && !workspaceId.success) return 'X-Kvman-Workspace is not a workspace id';
  return { mime: mime.data, name: name?.data, workspaceId: workspaceId?.data };
}

// The body goes into the intake; past 100 MB the intake is dropped and the rest of the body is read and discarded,
// so the client reads the answer instead of a reset. Returns whether the whole body was taken.
async function takeBody(request: FastifyRequest, intake: BlobIntake): Promise<boolean> {
  let taken = true;
  for await (const chunk of request.raw) {
    const bytes: unknown = chunk;
    if (!(bytes instanceof Uint8Array)) throw new TypeError('an HTTP body chunk is not bytes');
    if (!taken) continue;
    try {
      await intake.write(bytes);
    } catch (error) {
      if (!(error instanceof BlobTooLarge)) throw error;
      taken = false;
      await intake.discard();
    }
  }
  return taken;
}

// 12 §12.2: PUT /blobs streams the raw body into the blob store, up to 100 MB, and answers what was stored.
async function putBlob(context: RouteContext, request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const headers = uploadHeaders(request);
  if (typeof headers === 'string') return sendProblem(reply, context.problems.invalid(headers));
  const { runtime } = context.kernel();
  if (headers.workspaceId !== undefined && runtime.workspaces.stateOf(headers.workspaceId) !== 'open') {
    return sendProblem(reply, context.problems.coded('WORKSPACE_INVALID', { detail: `no workspace ${headers.workspaceId} exists` }));
  }
  const intake = await runtime.files.store.intake();
  const whole = await takeBody(request, intake).catch(async (error: unknown) => {
    await intake.discard();
    throw error;
  });
  if (!whole) {
    return sendProblem(reply, context.problems.coded('BLOB_TOO_LARGE', { params: { max: blobLimits.putBytes }, hint: 'upload at most 100 MB' }));
  }
  const meta = { mime: headers.mime, ...(headers.name === undefined ? {} : { name: headers.name }) };
  const info: BlobInfo = runtime.files.upload(await intake.finish(), meta, headers.workspaceId);
  return reply.code(200).send(info);
}

async function servingOf(context: RouteContext, blobId: string, mime: string, download: boolean): Promise<Serving> {
  if (download || !isInlineCandidate(mime)) return attachment;
  const { store } = context.kernel().runtime.files;
  if (mime === 'text/plain') return textServing(store.stream(blobId));
  return imageServing(mime, await store.read(blobId, 0, sniffBytes));
}

// 13 §13.7: nosniff and a sandbox CSP always; inline only for verified inert types.
async function getBlob(context: RouteContext, request: FastifyRequest<{ Params: { id: string }; Querystring: { download?: string } }>, reply: FastifyReply): Promise<FastifyReply> {
  const blobId = blobIdSchema.safeParse(request.params.id);
  if (!blobId.success) return sendProblem(reply, context.problems.invalid('the blob id is not 64 lowercase hex characters', blobId.error.issues));
  const { files } = context.kernel().runtime;
  const stat = files.store.stat(blobId.data);
  if (stat === undefined) return sendProblem(reply, context.problems.coded('BLOB_NOT_FOUND', { detail: `no blob ${blobId.data} exists` }));
  const serving = await servingOf(context, blobId.data, stat.mime, request.query.download === '1');
  reply.header('x-content-type-options', 'nosniff').header('content-security-policy', "sandbox; default-src 'none'").header('content-length', stat.size);
  if (serving.inline) return reply.code(200).header('content-type', serving.contentType).header('content-disposition', 'inline').send(files.store.stream(blobId.data));
  const disposition = stat.name === undefined ? 'attachment' : `attachment; filename*=UTF-8''${encodeURIComponent(stat.name)}`;
  return reply.code(200).header('content-type', 'application/octet-stream').header('content-disposition', disposition).send(files.store.stream(blobId.data));
}

export function registerBlobRoutes(app: FastifyInstance, context: RouteContext): void {
  app.get<{ Params: { id: string }; Querystring: { download?: string } }>('/api/v1/blobs/:id', (request, reply) => getBlob(context, request, reply));
  // Raw bytes, never parsed: this route's own content type parser hands the body over as a stream.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', (_request, _payload, done) => done(null));
    scope.put('/api/v1/blobs', (request, reply) => putBlob(context, request, reply));
  });
}
