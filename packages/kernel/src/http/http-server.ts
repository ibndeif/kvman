import { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import type { Kernel } from '../kernel.ts';
import { kernelProblem } from '../problems.ts';
import { createHttpApp } from './http-app.ts';

// kvman's HTTP server (plan 04), on 127.0.0.1 only. It starts only in web mode, after the web home is checked
// (ADR 0009, 41). `close` stops taking requests and ends the job streams; it resolves once the requests in flight,
// which a kernel stop ends, have answered.

export type HttpServer = { port: number; close(): Promise<void> };

function checkWebHome(kernel: Kernel): void {
  const home = kernel.web.webHome();
  if (!kernel.web.webFolders().has(home)) {
    throw kernelProblem('EXTENSION_INVALID', `The web home "${home}" (kernel.web.home) is no extension of this run that declares kvman.web.`, { namespace: home });
  }
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: Error & { code?: string }) =>
      reject(error.code === 'EADDRINUSE' ? kernelProblem('PORT_IN_USE', `The port ${port} is already in use.`, { port }) : error),
    );
    server.listen(port, '127.0.0.1', () => {
      const address: AddressInfo | string | null = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });
}

export async function startHttp(kernel: Kernel, options: { port: number }): Promise<HttpServer> {
  checkWebHome(kernel);
  const stopping = new AbortController();
  let port = options.port;
  const app = createHttpApp({ kernel, port: () => port, stopping: stopping.signal, logger: kernel.web.logger });
  const server = createAdaptorServer({ fetch: app.fetch });
  if (!(server instanceof Server)) throw new Error('the HTTP server must be node:http');
  port = await listen(server, options.port);
  return {
    port,
    close: () =>
      new Promise((resolve) => {
        stopping.abort();
        server.close(() => resolve());
        server.closeIdleConnections();
      }),
  };
}
