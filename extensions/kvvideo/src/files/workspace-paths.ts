import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { invalid, notFound } from '../problems.ts';

// Where kvvideo reads and writes (plan 16 §16.3): every path is inside the workspace folder, through `..` and symlinks
// alike. An input must exist; an output has its command's extension and is replaced only when asked.

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// The real path of the nearest part of `absolute` that exists, so a symlink anywhere along it is followed.
function realOfNearest(absolute: string): string {
  let existing = absolute;
  while (!existsSync(existing)) existing = path.dirname(existing);
  return path.join(realpathSync(existing), path.relative(existing, absolute));
}

/** A path of the workspace, made absolute; one that leaves it fails `VALIDATION_FAILED`. */
export function workspacePath(root: string, file: string): string {
  if (file.trim() === '') throw invalid('The path is empty.', { path: file });
  const absolute = path.resolve(root, file);
  if (!inside(root, absolute) || !inside(realpathSync(root), realOfNearest(absolute))) throw invalid(`${file} is outside the workspace folder.`, { path: file });
  return absolute;
}

function hasExtension(file: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(file).toLowerCase());
}

/** An existing input file of one of the extensions. */
export function inputPath(root: string, file: string, extensions: readonly string[]): string {
  const absolute = workspacePath(root, file);
  if (!hasExtension(file, extensions)) throw invalid(`${file} isn't one of ${extensions.join(', ')}.`, { path: file, extensions: [...extensions] });
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw notFound(`${file} doesn't exist.`, { path: file });
  return absolute;
}

/** An output file with the extension, its folders made; an existing one only with `replace`. */
export function outputPath(root: string, file: string, extension: string, replace: boolean): string {
  const absolute = workspacePath(root, file);
  if (!hasExtension(file, [extension])) throw invalid(`${file} must end with ${extension}.`, { path: file, extension });
  if (existsSync(absolute) && !replace) throw invalid(`${file} exists; set replace to true to write over it.`, { path: file });
  mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}
