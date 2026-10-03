import { createServer } from 'node:net';
import { BinFailure } from '../bin/bin-failure.ts';

// The preview's port (plan 09 §9.3): the first free port from 3738 to 3837 on 127.0.0.1, which is the only address
// the bin ever binds (CLAUDE.md §6).

export const firstPreviewPort = 3738;
export const lastPreviewPort = 3837;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** The first free preview port, or `NO_FREE_PORT` when 3738 to 3837 are all taken. */
export async function previewPort(isFree: (port: number) => Promise<boolean> = isPortFree): Promise<number> {
  for (let port = firstPreviewPort; port <= lastPreviewPort; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new BinFailure('NO_FREE_PORT', 'Ports 3738 to 3837 are all taken; stop something that listens on one.');
}
