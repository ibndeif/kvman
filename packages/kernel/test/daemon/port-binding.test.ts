import { createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
import { bindPort, ProblemError } from '../../src/index.ts';
import { ids } from './boot.ts';

function listening(port: number): Promise<Server | undefined> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(undefined));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Two neighbouring free ports: the first one taken by a blocker, the second free.
async function blockedPair(): Promise<{ blocker: Server; from: number }> {
  for (let from = 20_000 + Math.floor(Math.random() * 20_000); ; from += 2) {
    const blocker = await listening(from);
    if (blocker === undefined) continue;
    const probe = await listening(from + 1);
    if (probe !== undefined) {
      await close(probe);
      return { blocker, from };
    }
    await close(blocker);
  }
}

describe('ports (plan 03 §3.10, ADRs 0095, 0097)', () => {
  it('M1.8-E14 the port is the first free one in the range', async () => {
    const { blocker, from } = await blockedPair();
    const server = createServer();
    expect(await bindPort(server, { from, to: from + 1 }, ids.next())).toBe(from + 1);
    const other = createServer();
    const refused = await bindPort(other, { from, to: from + 1 }, ids.next()).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ProblemError);
    expect(refused instanceof ProblemError ? refused.problem : undefined).toMatchObject({ code: 'PORT_UNAVAILABLE', params: { from, to: from + 1 } });
    await close(server);
    await close(blocker);
  });
});
