import { delimiter } from 'node:path';
import { binFolderOf, socketPathOf } from '../daemon/home-paths.ts';

// ADR 0139: a process inherits the daemon's environment without its KVMAN_* variables, overlaid with its own; with a
// token it also gets the socket, the token, and the kv shim's folder last on PATH (12 §12.6).
export function environmentFor(daemon: NodeJS.ProcessEnv, overlay: Readonly<Record<string, string>>, home: string, token: string | undefined): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(daemon).filter(([name, value]) => !name.startsWith('KVMAN_') && value !== undefined));
  const environment: NodeJS.ProcessEnv = { ...inherited, ...overlay };
  if (token === undefined) return environment;
  const path = environment['PATH'];
  const bin = binFolderOf(home);
  return { ...environment, KVMAN_SOCKET: socketPathOf(home), KVMAN_TOKEN: token, PATH: path === undefined || path === '' ? bin : `${path}${delimiter}${bin}` };
}
