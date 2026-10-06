import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { bundledExtensions, bundledPresetsFolder } from '../src/bundled.ts';

// What ships with kvman (ADR 0026, 3 and 4): the bundled extensions are the kvman package's dependencies that have a
// `kvman` field, and the bundled presets are a folder of the package.

const packageFolder = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(packageFolder, '..', '..');
const manifestSchema = z.object({ files: z.array(z.string()), dependencies: z.record(z.string(), z.string()) });
const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(packageFolder, 'package.json'), 'utf8')));
const bundledNames = ['@kvman/kvai', '@kvman/kvbuilder', '@kvman/kvcoder', '@kvman/kvwebui'];

const temporaryFolders: string[] = [];

function packageWith(dependencies: Record<string, string>, installed: Record<string, object>): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvman-bundled-'));
  temporaryFolders.push(folder);
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'app', dependencies }));
  for (const [name, dependencyManifest] of Object.entries(installed)) {
    const dependencyFolder = path.join(folder, 'node_modules', name);
    mkdirSync(dependencyFolder, { recursive: true });
    writeFileSync(path.join(dependencyFolder, 'package.json'), JSON.stringify({ name, ...dependencyManifest }));
  }
  return folder;
}

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('what ships with kvman (ADR 0026)', () => {
  it('QA38-H1 the bundled extensions are the kvman package\'s workspace dependencies, each with its folder', () => {
    const extensions = bundledExtensions();
    expect([...extensions.keys()].sort()).toEqual(bundledNames);
    for (const [name, folder] of extensions) {
      expect(manifest.dependencies[name]).toBe('workspace:*');
      expect(z.object({ name: z.string() }).parse(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'))).name).toBe(name);
    }
  });

  it('QA38-H2 the bundled presets are a folder of the kvman package, which its files list', () => {
    expect(bundledPresetsFolder).toBe(path.join(packageFolder, 'presets'));
    expect(existsSync(path.join(bundledPresetsFolder, 'coder.json'))).toBe(true);
    expect(manifest.files).toContain('presets');
    expect(existsSync(path.join(root, 'presets'))).toBe(false);
  });

  it('QA38-E1 a dependency without a kvman field is not a bundled extension', () => {
    const extensions = bundledExtensions();
    expect(extensions.has('@kvman/kernel')).toBe(false);
    expect(extensions.has('@kvman/sdk')).toBe(false);

    const folder = packageWith({ '@acme/notes': '1.0.0', plain: '1.0.0' }, { '@acme/notes': { kvman: { namespace: 'notes' } }, plain: {} });
    expect([...bundledExtensions(folder).keys()]).toEqual(['@acme/notes']);
  });

  it('QA38-E2 a package with no dependencies has no bundled extensions', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-bundled-'));
    temporaryFolders.push(folder);
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'app' }));
    expect(bundledExtensions(folder).size).toBe(0);
  });

  it('QA38-E3 a dependency that is not installed fails, naming it', () => {
    const folder = packageWith({ '@acme/missing': '1.0.0' }, {});
    expect(() => bundledExtensions(folder)).toThrow('@acme/missing/package.json');
  });
});
