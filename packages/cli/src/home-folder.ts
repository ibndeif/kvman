import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// 12 §12.5, R-Q4: --home, else KVMAN_HOME, else ~/.kvman; a relative path is read from the current folder.
export function resolveHome(flag: string | undefined, environment: NodeJS.ProcessEnv): string {
  const chosen = flag ?? environment['KVMAN_HOME'];
  return chosen === undefined || chosen === '' ? join(homedir(), '.kvman') : resolve(chosen);
}
