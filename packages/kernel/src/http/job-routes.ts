import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Kernel } from '../kernel.ts';
import { answer } from './envelope.ts';
import { jobEvents } from './job-events.ts';

// Jobs over HTTP (plan 04 §4.1, §4.4): a job's row, cancelling it, and the stream of an async or scheduled job.
export function registerJobRoutes(app: Hono, kernel: Kernel, stopping: AbortSignal): void {
  app.get('/api/jobs/:id', (c) => answer({ job: kernel.web.job(c.req.param('id')) }));
  app.post('/api/jobs/:id/cancel', (c) => {
    kernel.cancel(c.req.param('id'));
    return answer({});
  });
  app.get('/api/jobs/:id/stream', (c) => {
    const id = kernel.web.job(c.req.param('id')).id;
    const stop = AbortSignal.any([c.req.raw.signal, stopping]);
    return streamSSE(c, async (stream) => {
      for await (const event of jobEvents(kernel, id, stop)) await stream.writeSSE({ event: event.event, data: JSON.stringify(event.data) });
    });
  });
}
