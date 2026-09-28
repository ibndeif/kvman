import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageJsonSchema } from '@kvman/protocol';

// Where a package resolves from a file (a symlink under a pnpm layout) and the real folder it points to.
function packageFolder(fromFile: string, name: string): { resolved: string; real: string } {
  for (const folder of createRequire(fromFile).resolve.paths(name) ?? []) {
    const candidate = join(folder, name);
    if (existsSync(join(candidate, 'package.json'))) return { resolved: candidate, real: realpathSync(candidate) };
  }
  throw new Error(`the kernel cannot find its dependency ${name}`);
}

function packageRoot(fromFile: string, name: string): string {
  return packageFolder(fromFile, name).real;
}

// The kernel package's folder: two levels above this module, in its sources and in its build.
function kernelRoot(): string {
  return realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
}

// A package's folders and those of its dependencies, transitively: the permission model checks the path a module is
// imported through (a symlink beside its dependent) as well as the real folder it is read from.
function dependencyClosure(fromManifest: string, name: string, found: Set<string> = new Set()): string[] {
  const { resolved, real } = packageFolder(fromManifest, name);
  if (!found.has(real)) {
    found.add(real);
    const manifest = join(real, 'package.json');
    const { dependencies } = packageJsonSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')));
    for (const dependency of Object.keys(dependencies ?? {})) dependencyClosure(manifest, dependency, found);
  }
  found.add(resolved);
  return [...found];
}

// What the loader and sandboxed hosts may read besides the staged tree: the kernel package, the SDK, protocol, and
// Zod it resolves to (hosts always use the kernel's own SDK, 06 §6.2), and intl-messageformat with its dependencies,
// which validation and ctx.i18n.t use (ADR 0160).
export function kernelReadRoots(): string[] {
  const root = kernelRoot();
  const kernelManifest = join(root, 'package.json');
  const protocol = packageRoot(kernelManifest, '@kvman/protocol');
  const sdk = packageRoot(kernelManifest, '@kvman/sdk');
  return [root, protocol, sdk, packageRoot(join(protocol, 'package.json'), 'zod'), ...dependencyClosure(kernelManifest, 'intl-messageformat')];
}

// The version of the SDK the kernel resolves, which a package's `peerDependencies['@kvman/sdk']` must accept.
export function kernelSdkVersion(): string {
  const kernelManifest = join(kernelRoot(), 'package.json');
  const { version } = packageJsonSchema.parse(JSON.parse(readFileSync(join(packageRoot(kernelManifest, '@kvman/sdk'), 'package.json'), 'utf8')));
  if (version === undefined) throw new Error('the kernel\'s @kvman/sdk has no version');
  return version;
}
