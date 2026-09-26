import { realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const gatedFolder = '.kvman';

// A path that leaves the workspace: through `..`, an absolute path, a symlink, or into the kvman home folder.
export class PathEscape extends Error {
  constructor(path: string) {
    super(`${path} leaves the workspace`);
    this.name = 'PathEscape';
  }
}

// `root` and `home` are real paths (symlinks resolved).
export type Jail = { root: string; home: string };

// `real` is the path with every existing part resolved; `relative` is it from the root with `/` separators; `gated`
// is true when the path as written or as resolved is under <root>/.kvman/, the trust gate (07 §7.2), so a symlink in
// .kvman/ never reads around the gate.
export type JailedPath = { real: string; relative: string; gated: boolean };

function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

// The real path of the longest existing part, with the missing rest appended: a symlink anywhere on the way is
// followed, so a missing file under a symlinked folder resolves where the folder points.
function realPathOf(path: string): string {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(realPathOf(parent), relative(parent, path));
  }
}

// 07 §7.2, ADR 0136: a path is resolved against the workspace root, normalized, and realpath-checked. The home
// folder is refused unless the path is inside the workspace's own root and that root is inside the home folder (a
// preview workspace).
export function resolveInJail(jail: Jail, path: string): JailedPath {
  const normalized = resolve(jail.root, path);
  if (!inside(normalized, jail.root)) throw new PathEscape(path);
  const real = realPathOf(normalized);
  if (!inside(real, jail.root)) throw new PathEscape(path);
  if (inside(real, jail.home) && !inside(jail.root, jail.home)) throw new PathEscape(path);
  const fromRoot = relative(jail.root, real).split(sep).join('/');
  const written = relative(jail.root, normalized).split(sep).join('/');
  return { real, relative: fromRoot === '' ? '.' : fromRoot, gated: isGated(fromRoot) || isGated(written) };
}

function isGated(fromRoot: string): boolean {
  return fromRoot === gatedFolder || fromRoot.startsWith(`${gatedFolder}/`);
}
