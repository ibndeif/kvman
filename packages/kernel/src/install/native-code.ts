import type { FileList, Issue } from '@kvman/protocol';

// The package that owns a file of a hoisted tree: the segment after the last `node_modules`.
export function packageOfPath(path: string): string {
  const segments = path.split('/');
  const at = segments.lastIndexOf('node_modules');
  const first = segments[at + 1] ?? path;
  return first.startsWith('@') ? `${first}/${segments[at + 2] ?? ''}` : first;
}

// ADR 0118: a snapshot holding a compiled `.node` addon, dependencies included, "uses native code"; it needs
// `dedicated` isolation to load it (06 §6.2).
export function nativeCodeWarning(list: FileList): Issue | undefined {
  const packages = [...new Set(list.filter((entry) => 'sha256' in entry && entry.path.endsWith('.node')).map((entry) => packageOfPath(entry.path)))].sort();
  if (packages.length === 0) return undefined;
  return { path: '', message: 'uses native code', code: 'NATIVE_CODE', severity: 'warning', params: { packages } };
}
