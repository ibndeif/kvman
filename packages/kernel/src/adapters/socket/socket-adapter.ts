import { chmodSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { socketLimits, type SocketAnswer } from '@kvman/protocol';
import type { KernelLogger } from '../../hosts/kernel-logger.ts';
import type { UlidGenerator } from '../../ulid.ts';
import type { SocketRequests } from './socket-requests.ts';

export type SocketAdapterDeps = { path: string; requests: SocketRequests; logger: KernelLogger; ids: UlidGenerator };

// 12 §12.4, ADR 0140: kernel.sock (0600) takes one newline-terminated JSON request per connection, of at most 17 MB,
// answers it with one line, and closes the connection; anything after the first line is never read.
export class SocketAdapter {
  readonly #deps: SocketAdapterDeps;
  readonly #connections = new Set<Socket>();
  #server: Server | undefined;
  #stopping = false;

  constructor(deps: SocketAdapterDeps) {
    this.#deps = deps;
  }

  // The lock is held, so a socket file left by a kernel that died is stale and removed first.
  async listen(): Promise<void> {
    const { path } = this.#deps;
    rmSync(path, { force: true });
    // A client may close its side after its request; the answer still goes back on the open half.
    const server = createServer({ allowHalfOpen: true }, (connection) => this.#serve(connection));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, () => {
        server.off('error', reject);
        resolve();
      });
    });
    chmodSync(path, 0o600);
    this.#server = server;
  }

  // Shutdown (03 §3.9, ADR 0090): new requests are answered KERNEL_STOPPING until the socket closes.
  stopAdmitting(): void {
    this.#stopping = true;
  }

  async close(): Promise<void> {
    const server = this.#server;
    if (server === undefined) return;
    this.#server = undefined;
    for (const connection of this.#connections) connection.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(this.#deps.path, { force: true });
  }

  #serve(connection: Socket): void {
    this.#connections.add(connection);
    connection.once('close', () => this.#connections.delete(connection));
    connection.on('error', (error) => this.#log('a kernel.sock connection failed', error));
    const chunks: Buffer[] = [];
    let size = 0;
    let taken = false;
    const answer = (line: string): Promise<SocketAnswer> => {
      if (this.#stopping) return Promise.resolve(this.#deps.requests.refused('KERNEL_STOPPING', 'the kernel is shutting down'));
      return this.#deps.requests.answer(line);
    };
    const take = (settled: Promise<SocketAnswer>): void => {
      taken = true;
      connection.pause();
      connection.removeAllListeners('data');
      void settled.then((reply) => connection.end(`${JSON.stringify(reply)}\n`), (error: unknown) => {
        this.#log('a kernel.sock request failed', error);
        connection.destroy();
      });
    };
    connection.on('data', (chunk: Buffer) => {
      const newline = chunk.indexOf(0x0a);
      const part = newline === -1 ? chunk : chunk.subarray(0, newline);
      size += part.length;
      if (size > socketLimits.requestBytes) {
        take(Promise.resolve(this.#deps.requests.refused('PAYLOAD_TOO_LARGE', `a kernel.sock request is at most ${socketLimits.requestBytes} bytes`)));
        return;
      }
      chunks.push(part);
      if (newline !== -1) take(answer(Buffer.concat(chunks).toString('utf8')));
    });
    connection.once('end', () => {
      if (!taken && size > 0) take(answer(Buffer.concat(chunks).toString('utf8')));
      else if (!taken) connection.end();
    });
  }

  #log(message: string, error: unknown): void {
    this.#deps.logger.write({ level: 'warn', message, fields: { error: error instanceof Error ? error.name : 'unknown' }, attributes: { correlationId: this.#deps.ids.next() } });
  }
}
