import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Hono } from 'hono';
import { z } from '@kvman/sdk';
import type { Kernel } from '../kernel.ts';
import { fileLimitBytes } from '../limits.ts';
import { validationFailed } from '../store/json-values.ts';
import { answer } from './envelope.ts';
import { writeCapped } from './request-body.ts';

// Uploads and downloads (plan 04 §4.1, ADR 0009, 37–39): both name their workspace; an upload is the raw body; a
// download is always an attachment, so a browser never renders a file on kvman's origin.

const uploadSchema = z.object({ name: z.string().min(1), workspaceId: z.string().min(1) });
const downloadSchema = z.object({ workspaceId: z.string().min(1) });

function parsedQuery<Shape extends z.ZodType>(schema: Shape, query: Record<string, string>): z.output<Shape> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) throw validationFailed('The query', parsed.error);
  return parsed.data;
}

// `attachment` with the name as UTF-8, and an ASCII stand-in for clients that don't read `filename*`.
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerFileRoutes(app: Hono, kernel: Kernel): void {
  app.post('/api/files', async (c) => {
    const { name, workspaceId } = parsedQuery(uploadSchema, c.req.query());
    kernel.web.workspace(workspaceId);
    const type = c.req.header('content-type') ?? 'application/octet-stream';
    const upload = kernel.web.uploadPath();
    await writeCapped(c.req.raw, fileLimitBytes, upload);
    try {
      return answer({ file: kernel.web.adopt({ name, type, owner: { kind: 'user' }, workspaceId }, upload) });
    } catch (error) {
      await rm(upload, { force: true });
      throw error;
    }
  });
  app.get('/api/files/:id', (c) => {
    const { workspaceId } = parsedQuery(downloadSchema, c.req.query());
    const file = kernel.web.file(c.req.param('id'), workspaceId);
    const headers = { 'Content-Type': file.type, 'Content-Length': String(file.size), 'Content-Disposition': attachment(file.name), 'X-Content-Type-Options': 'nosniff' };
    return new Response(Readable.toWeb(createReadStream(kernel.web.filePath(file.id))), { headers });
  });
  app.get('/api/locales/:lang', (c) => answer({ catalog: kernel.catalog(c.req.param('lang')) }));
}
