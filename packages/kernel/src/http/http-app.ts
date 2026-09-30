import { Hono } from 'hono';
import { ProblemError } from '@kvman/sdk';
import type { Kernel } from '../kernel.ts';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import { registerCallRoutes } from './call-routes.ts';
import { failure } from './envelope.ts';
import { registerFileRoutes } from './file-routes.ts';
import { registerJobRoutes } from './job-routes.ts';
import { isOwnOrigin } from './own-origin.ts';
import { registerWebRoutes } from './web-routes.ts';

// The kernel's HTTP API (plan 04): every request passes the Host and Origin check first; a Problem thrown by a route is
// its envelope, and anything else is logged (never with the request's body) and answered HANDLER_FAILED.

export type HttpAppOptions = { kernel: Kernel; port: () => number; stopping: AbortSignal; logger: KernelLogger };

export function createHttpApp({ kernel, port, stopping, logger }: HttpAppOptions): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (!isOwnOrigin(c.req.header('host'), c.req.header('origin'), port())) {
      return failure(kernelProblem('FORBIDDEN_ORIGIN', "The request's Host or Origin isn't kvman's own.").problem);
    }
    await next();
    return undefined;
  });
  registerCallRoutes(app, kernel);
  registerJobRoutes(app, kernel, stopping);
  registerFileRoutes(app, kernel);
  registerWebRoutes(app, kernel);
  app.onError((error) => {
    if (error instanceof ProblemError) return failure(error.problem);
    logger.error('An HTTP request failed.', { error: error.message, stack: error.stack ?? '' });
    return failure({ code: 'HANDLER_FAILED', message: 'The request failed.' });
  });
  return app;
}
