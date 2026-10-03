// A folder's path as the segments the folder browser shows (plan 06 §6.2, ADR 0009, 224): `/` or a drive such as `C:\`
// first, then each folder, every segment with the path that goes to it. There is a branch for each kind of path.

export type PathSegment = { name: string; path: string };

const drive = /^[A-Za-z]:[\\/]/;
const share = /^\\\\[^\\]+\\[^\\]+/;

function windowsSegments(path: string, root: string): PathSegment[] {
  const separator = path.includes('\\') ? '\\' : '/';
  const names = path.slice(root.length).split(/[\\/]/).filter((name) => name !== '');
  let walked = root;
  return [{ name: root, path: root }, ...names.map((name) => ({ name, path: (walked = walked.endsWith(separator) ? `${walked}${name}` : `${walked}${separator}${name}`) }))];
}

/** The segments of an absolute path: POSIX, a drive path, or a network share. */
export function pathSegments(path: string): PathSegment[] {
  const root = drive.exec(path)?.[0].slice(0, 3) ?? share.exec(path)?.[0];
  if (root !== undefined) return windowsSegments(path, root);
  const names = path.split('/').filter((name) => name !== '');
  let walked = '';
  return [{ name: '/', path: '/' }, ...names.map((name) => ({ name, path: (walked = `${walked}/${name}`) }))];
}
