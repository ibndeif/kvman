import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { internalPackageNames, repositoryRoot } from './repository.ts';

type PackageJson = {
  name: string;
  packageManager?: string;
  exports?: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const workspaceFolders = ['packages', 'extensions', 'examples'];
const exactVersion = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function readPackageJson(folder: string): PackageJson {
  return JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')) as PackageJson;
}

function workspacePackageFolders(): string[] {
  return workspaceFolders
    .map((folder) => path.join(repositoryRoot, folder))
    .filter((folder) => existsSync(folder))
    .flatMap((folder) => readdirSync(folder).map((name) => path.join(folder, name)));
}

describe('dependencies and packages (plan 14 §14.7, 01 §1.5)', () => {
  it('M0.1-E27 every dependency is pinned exactly and pnpm is pinned', () => {
    const root = readPackageJson(repositoryRoot);
    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    for (const folder of [repositoryRoot, ...workspacePackageFolders()]) {
      const manifest = readPackageJson(folder);
      const pinned = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies };
      for (const [name, version] of Object.entries(pinned)) {
        expect(version === 'workspace:*' || exactVersion.test(version), `${manifest.name}: ${name}@${version}`).toBe(true);
      }
    }
  });

  it('M0.1-E28 the workspace holds exactly the eight packages with their entry points', () => {
    const packagesFolder = path.join(repositoryRoot, 'packages');
    expect(readdirSync(packagesFolder).sort()).toEqual(internalPackageNames);
    for (const name of internalPackageNames) {
      const folder = path.join(packagesFolder, name);
      const manifest = readPackageJson(folder);
      expect(manifest.name).toBe(`@kvman/${name}`);
      expect(manifest.exports?.['.']).toEqual({
        '@kvman/source': './src/index.ts',
        types: './dist/index.d.ts',
        default: './dist/index.js',
      });
      expect(existsSync(path.join(folder, 'src/index.ts'))).toBe(true);
    }
  });
});
