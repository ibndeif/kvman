import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageJsonSchema } from '@kvman/protocol';

function packageRoot(fromFile: string, name: string): string {
  for (const folder of createRequire(fromFile).resolve.paths(name) ?? []) {
    const candidate = join(folder, name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
  }
  throw new Error(`the kernel cannot find its dependency ${name}`);
}

// The kernel package's folder: two levels above this module, in its sources and in its build.
function kernelRoot(): string {
  return realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
}

// What the loader may read besides the staged tree: the kernel package, and the SDK, protocol, and Zod it resolves
// to (hosts always use the kernel's own SDK, 06 §6.2).
export function kernelReadRoots(): string[] {
  const root = kernelRoot();
  const kernelManifest = join(root, 'package.json');
  const protocol = packageRoot(kernelManifest, '@kvman/protocol');
  const sdk = packageRoot(kernelManifest, '@kvman/sdk');
  return [root, protocol, sdk, packageRoot(join(protocol, 'package.json'), 'zod')];
}

// The version of the SDK the kernel resolves, which a package's `peerDependencies['@kvman/sdk']` must accept.
export function kernelSdkVersion(): string {
  const kernelManifest = join(kernelRoot(), 'package.json');
  const { version } = packageJsonSchema.parse(JSON.parse(readFileSync(join(packageRoot(kernelManifest, '@kvman/sdk'), 'package.json'), 'utf8')));
  if (version === undefined) throw new Error('the kernel\'s @kvman/sdk has no version');
  return version;
}
