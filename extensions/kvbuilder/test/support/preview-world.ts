import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { writeIn } from './kvcustomizer-kernel.ts';
import type { Kvman } from './kvman-child.ts';

// Preview helpers: a minimal project written without npm (a `path:` extension gets `@kvman/sdk` from the kernel),
// the preview's processes and home, and listeners that hold ports.

export const statusSchema = z.union([z.object({ running: z.literal(false) }), z.object({ running: z.literal(true), url: z.string(), extensions: z.array(z.string()), startedAt: z.string() })]);

const processesSchema = z.array(z.object({ extension: z.string(), workspaceId: z.string(), name: z.string(), pid: z.number() }));

export function writeProject(folder: string, name: string, namespace: string): void {
  writeIn(folder, path.join(name, 'package.json'), { name, version: '0.1.0', type: 'module', main: 'dist/index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace, source: 'src/index.ts', dependencies: {} } });
  writeIn(
    folder,
    path.join(name, 'src', 'index.ts'),
    `import { z } from '@kvman/sdk';\nexport default (ctx) => {\n  ctx.registerQuery('${namespace}.greeting.get', {\n    description: 'Gives the greeting.',\n    public: true,\n    input: z.object({}),\n    output: z.object({ text: z.string() }),\n    handle: () => ({ text: 'Hello from ${namespace}!' }),\n  });\n};\n`,
  );
}

export async function kvcustomizerProcesses(kvman: Kvman): Promise<{ name: string; pid: number }[]> {
  return processesSchema.parse(await kvman.call('queries', 'kernel.processes.list', {})).filter((process) => process.extension === '@kvman/kvcustomizer' && process.workspaceId === kvman.workspaceId);
}

export function previewHomeOf(kvman: Kvman): string {
  return path.join(tmpdir(), `kvman-preview-${kvman.workspaceId}`);
}

/** Listens on each port it can of `ports`; a port something else holds is busy already. */
export async function holdPorts(ports: readonly number[]): Promise<() => Promise<void>> {
  const servers: Server[] = [];
  for (const port of ports) {
    const server = createServer();
    const listening = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (listening) servers.push(server);
  }
  return async () => {
    for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
