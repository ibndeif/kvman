import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';

// The eight packages published to npm (ADR 0026, 1, 5, and 7): each is public under MIT with its own files, and an
// extension that imports another one at runtime depends on it.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const packages = ['packages/sdk', 'packages/kernel', 'packages/testkit', 'packages/cli'];
const extensions = ['extensions/kvai', 'extensions/kvwebui', 'extensions/kvcoder', 'extensions/kvcustomizer'];
const released = ['packages/sdk', 'packages/testkit', ...extensions];

const ranges = z.record(z.string(), z.string());
const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  private: z.boolean().optional(),
  license: z.string(),
  repository: z.object({ type: z.string(), url: z.string(), directory: z.string() }),
  homepage: z.string(),
  bugs: z.object({ url: z.string() }),
  files: z.array(z.string()).min(1),
  exports: z.record(z.string(), z.unknown()).optional(),
  dependencies: ranges.optional(),
  kvman: z.object({ dependencies: ranges.optional() }).optional(),
});

const manifestOf = (folder: string) => manifestSchema.parse(JSON.parse(readFileSync(path.join(root, folder, 'package.json'), 'utf8')));

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|vue)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// The extensions a folder's sources import at runtime; only a whole `import type` line is left out.
function runtimeImports(folder: string, names: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(folder)) {
    for (const [, specifier = ''] of readFileSync(file, 'utf8').matchAll(/^import (?!type )[^;]*? from '([^']+)';/gm)) {
      const name = names.find((candidate) => specifier === candidate || specifier.startsWith(`${candidate}/`));
      if (name !== undefined) found.add(name);
    }
  }
  return found;
}

describe('the packages published to npm (ADR 0026)', () => {
  it.each([...packages, ...extensions])('QA38-H3 %s is public under MIT, with its repository folder, files, licence, and README', (folder) => {
    const manifest = manifestOf(folder);
    expect(manifest.private).toBeUndefined();
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.license).toBe('MIT');
    expect(manifest.repository).toEqual({ type: 'git', url: 'git+https://github.com/ibndeif/kvman.git', directory: folder });
    expect(manifest.homepage).toBe('https://github.com/ibndeif/kvman#readme');
    expect(manifest.bugs).toEqual({ url: 'https://github.com/ibndeif/kvman/issues' });
    expect(readFileSync(path.join(root, folder, 'LICENSE'), 'utf8')).toBe(readFileSync(path.join(root, 'LICENSE'), 'utf8'));
    expect(readFileSync(path.join(root, folder, 'README.md'), 'utf8')).toContain(`# ${manifest.name}\n`);
  });

  it.each(['packages/kernel', ...extensions])('QA38-H4 %s exports its package.json', (folder) => {
    expect(manifestOf(folder).exports?.['./package.json']).toBe('./package.json');
  });

  it('QA38-H5 an extension that imports another one at runtime lists it in dependencies, pinned, and in kvman.dependencies', () => {
    const names = extensions.map((folder) => manifestOf(folder).name);
    const imported = new Map(extensions.map((folder) => [folder, runtimeImports(path.join(root, folder, 'src'), names)]));
    expect([...(imported.get('extensions/kvcoder') ?? [])]).toEqual(['@kvman/kvai']);
    for (const [folder, runtime] of imported) {
      const manifest = manifestOf(folder);
      for (const name of runtime) {
        expect(manifest.kvman?.dependencies?.[name], `${folder} → ${name}`).toBe('^0.1.0');
        expect(manifest.dependencies?.[name], `${folder} → ${name}`).toBe('workspace:*');
      }
    }
  });

  it.each(released)('QA38-H7 %s has a changelog that starts at 0.1.0', (folder) => {
    const changelog = readFileSync(path.join(root, folder, 'CHANGELOG.md'), 'utf8');
    expect(changelog.startsWith(`# ${manifestOf(folder).name}\n`)).toBe(true);
    expect(changelog.match(/^## .+$/gm)?.at(-1)).toBe('## 0.1.0');
    expect(existsSync(path.join(root, '.changeset', 'config.json'))).toBe(true);
  });
});
