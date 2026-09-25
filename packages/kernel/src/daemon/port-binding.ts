import type { Server } from 'node:net';
import { kernelProblem, ProblemError } from '../problems.ts';

// Where the kernel listens (03 §3.10, ADR 0097): a range tried in order, or exactly one port given with --port.
export type PortChoice = { from: number; to: number } | { port: number };

export const loopbackHost = '127.0.0.1';

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error): void => {
      server.off('listening', listening);
      if ('code' in error && error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    };
    const listening = (): void => {
      server.off('error', failed);
      resolve(true);
    };
    server.once('error', failed);
    server.once('listening', listening);
    server.listen(port, loopbackHost);
  });
}

// Binds the first free port of the choice on 127.0.0.1; none free is PORT_UNAVAILABLE (ADR 0095).
export async function bindPort(server: Server, choice: PortChoice, correlationId: string): Promise<number> {
  const [from, to] = 'port' in choice ? [choice.port, choice.port] : [choice.from, choice.to];
  for (let port = from; port <= to; port += 1) {
    if (await listen(server, port)) return port;
  }
  const params = 'port' in choice ? { port: choice.port } : { from: choice.from, to: choice.to };
  throw new ProblemError(kernelProblem('PORT_UNAVAILABLE', { correlationId, params, hint: 'stop what uses the port, or choose another with --port' }));
}
