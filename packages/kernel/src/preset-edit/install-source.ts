import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { packageNameSchema, type ExtensionSource, type InstallSource } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';

// An install source carries the extension's name (plan 02 §2.12, ADR 0025): `bundled:` and `npm:` say it, and a
// `path:` folder's package.json holds it. The preset stores the name as the key and the source the loader reads (§2.10).

export type ResolvedInstall = { name: string; storedSource: ExtensionSource };

const bundledPrefix = 'bundled:';
const npmPrefix = 'npm:';
const pathPrefix = 'path:';

async function nameInFolder(folder: string): Promise<string> {
  const file = path.join(folder, 'package.json');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw kernelProblem('VALIDATION_FAILED', `${file} can't be read (${reason}).`, { folder });
  }
  const name = typeof manifest === 'object' && manifest !== null && 'name' in manifest ? packageNameSchema.safeParse(manifest.name) : undefined;
  if (name === undefined || !name.success) {
    throw kernelProblem('VALIDATION_FAILED', `${file} has no valid package name.`, { folder });
  }
  return name.data;
}

/** The name and the stored source of `source`; a `path:` folder resolves against the folder of the preset file written. */
export async function resolveInstallSource(source: InstallSource, presetFolder: string): Promise<ResolvedInstall> {
  if (source.startsWith(bundledPrefix)) return { name: source.slice(bundledPrefix.length), storedSource: 'bundled' };
  if (source.startsWith(npmPrefix)) {
    const nameAndVersion = source.slice(npmPrefix.length);
    const versionStart = nameAndVersion.lastIndexOf('@');
    return { name: nameAndVersion.slice(0, versionStart), storedSource: `npm:${nameAndVersion.slice(versionStart + 1)}` };
  }
  const folder = source.slice(pathPrefix.length);
  return { name: await nameInFolder(path.resolve(presetFolder, folder)), storedSource: `path:${folder}` };
}
