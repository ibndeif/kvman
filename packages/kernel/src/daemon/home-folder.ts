import { chmodSync, mkdirSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { socketLimits } from '@kvman/protocol';
import { kernelProblem, ProblemError } from '../problems.ts';
import { socketPathOf } from './home-paths.ts';

const homeFolderMode = 0o700;

function entriesOf(home: string): Dirent[] | undefined {
  try {
    return readdirSync(home, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    if (error instanceof Error && 'code' in error && error.code === 'ENOTDIR') return [];
    throw error;
  }
}

// Before kvman.db exists, a home folder may hold only what a start that stopped early left: its lock and its logs.
function allowedWithoutDatabase(entry: Dirent): boolean {
  return (entry.name === 'daemon.lock' && entry.isFile()) || (entry.name === 'logs' && entry.isDirectory());
}

// 03 §3.9 step 0, R-Q4, ADR 0089: kvman never writes into a folder it did not create. A missing folder is created and
// an empty one initialized, both with mode 0700; a folder holding anything else without kvman.db is refused. A home
// whose kernel.sock path would not fit the operating system's limit is refused too (ADR 0140).
export function prepareHomeFolder(home: string, correlationId: string): void {
  const refused = (detail: string): ProblemError => new ProblemError(kernelProblem('HOME_INVALID', {
    correlationId, detail, hint: 'choose an empty or new folder with --home or KVMAN_HOME',
  }));
  const socket = socketPathOf(home);
  if (Buffer.byteLength(socket) > socketLimits.pathBytes) {
    throw new ProblemError(kernelProblem('HOME_INVALID', {
      correlationId, detail: `the socket path ${socket} is longer than ${socketLimits.pathBytes} bytes`, hint: 'use a shorter home path with --home or KVMAN_HOME',
    }));
  }
  const entries = entriesOf(home);
  if (entries === undefined) {
    mkdirSync(home, { recursive: true, mode: homeFolderMode });
    chmodSync(home, homeFolderMode);
    return;
  }
  if (!statSync(home).isDirectory()) throw refused(`${home} is not a folder`);
  if (entries.some((entry) => entry.name === 'kvman.db')) return;
  const other = entries.find((entry) => !allowedWithoutDatabase(entry));
  if (other !== undefined) throw refused(`${home} holds ${other.name} and no kvman.db`);
  chmodSync(home, homeFolderMode);
}
