import path from 'node:path';

/** A workspace file as an answer names it: relative to the workspace, with `/` on every OS. */
export function answerPath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}
