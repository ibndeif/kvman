import type { Hono } from 'hono';
import type { Kernel } from '../kernel.ts';
import { kernelProblem } from '../problems.ts';
import { failure } from './envelope.ts';
import { fileWithin, staticResponse } from './static-files.ts';

// Static files (plan 04 §4.1, ADR 0009, 41): `/web/<namespace>/<path>` from that extension's `kvman.web` folder, and
// every other path outside /api from the `kernel.web.home` extension's folder, falling back to its `index.html`. A miss
// is a plain 404; an unknown /api route is the envelope.

const notFound = (): Response => new Response('Not Found', { status: 404 });

export function registerWebRoutes(app: Hono, kernel: Kernel): void {
  app.all('/api/*', (c) => failure(kernelProblem('NOT_FOUND', `There is no route ${c.req.method} ${c.req.path}.`).problem));
  app.get('/web/:namespace/*', (c) => {
    const folder = kernel.web.webFolders().get(c.req.param('namespace'));
    const file = folder === undefined ? undefined : fileWithin(folder, c.req.path.slice(`/web/${c.req.param('namespace')}/`.length));
    return file === undefined ? notFound() : staticResponse(file);
  });
  app.get('*', (c) => {
    const folder = kernel.web.webFolders().get(kernel.web.webHome());
    if (folder === undefined) return notFound();
    const file = fileWithin(folder, c.req.path) ?? fileWithin(folder, 'index.html');
    return file === undefined ? notFound() : staticResponse(file);
  });
}
