import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extensionManifestSchema, type ExtensionManifest, type ExtensionSource, type Preset } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';

// Where each extension of a run lives, and its manifest (plan 02 §2.9).

export type ExtensionFolders = {
  home: string;
  presetFolder: string;
  bundled: ReadonlyMap<string, string>;
};

export type ReadExtension = {
  name: string;
  source: ExtensionSource;
  folder: string;
  manifest: ExtensionManifest;
  entryPath: string;
};

function folderOf(name: string, source: ExtensionSource, folders: ExtensionFolders): string {
  if (source === 'bundled') {
    const folder = folders.bundled.get(name);
    if (folder === undefined) throw kernelProblem('EXTENSION_INVALID', `${name} is not a bundled extension.`, { extension: name });
    return folder;
  }
  if (source.startsWith('npm:')) return path.join(folders.home, 'extensions', `${name}@${source.slice('npm:'.length)}`, 'node_modules', name);
  return path.resolve(folders.presetFolder, source.slice('path:'.length));
}

function readManifest(name: string, folder: string): ExtensionManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw kernelProblem('EXTENSION_INVALID', `${name}: its package.json can't be read (${reason}).`, { extension: name });
  }
  const result = extensionManifestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'package.json'}: ${issue.message}`).join('; ');
    throw kernelProblem('EXTENSION_INVALID', `${name}: its manifest is invalid (${issues}).`, { extension: name });
  }
  if (result.data.name !== name) {
    throw kernelProblem('EXTENSION_INVALID', `${name}: its package.json is named ${result.data.name}.`, { extension: name });
  }
  return result.data;
}

// A `path:` extension loads its TypeScript `kvman.source` when it names one; otherwise, and always for bundled and
// npm extensions, it loads `main`.
function entryOf(source: ExtensionSource, folder: string, manifest: ExtensionManifest): string {
  const sourceEntry = manifest.kvman.source;
  const entry = source.startsWith('path:') && sourceEntry !== undefined ? sourceEntry : manifest.main;
  return path.resolve(folder, entry);
}

export function readExtensions(preset: Preset, folders: ExtensionFolders): ReadExtension[] {
  return Object.entries(preset.extensions).map(([name, source]) => {
    const folder = folderOf(name, source, folders);
    const manifest = readManifest(name, folder);
    return { name, source, folder, manifest, entryPath: entryOf(source, folder, manifest) };
  });
}
