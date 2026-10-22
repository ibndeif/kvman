import path from 'node:path';

// Where kvman starts (plan 15 §15.3, ADR 0099, 15): the window's first folder when it is local, the user's home folder
// with no folder, and nowhere for a remote or virtual folder (local folders only, ADR 0099, 6).

export type FolderUri = { scheme: string; fsPath: string };
export type StartFolder = { kind: 'local'; path: string } | { kind: 'remote' };

export function startFolder(folders: readonly FolderUri[] | undefined, homeFolder: string): StartFolder {
  const first = folders?.[0];
  if (first === undefined) return { kind: 'local', path: homeFolder };
  return first.scheme === 'file' ? { kind: 'local', path: first.fsPath } : { kind: 'remote' };
}

/** kvman's log file, in its home as kvman finds it: `KVMAN_HOME`, else `~/.kvman` (plan 01 §1.3). */
export function logFile(kvmanHome: string | undefined, homeFolder: string): string {
  return path.join(kvmanHome ?? path.join(homeFolder, '.kvman'), 'logs', 'kvman.log');
}
