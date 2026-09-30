import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

type PackageJson = { name: string; fields: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPackage(folder: string): PackageJson {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repositoryRoot, folder, 'package.json'), 'utf8'));
  if (!isRecord(parsed) || typeof parsed['name'] !== 'string') throw new Error(`${folder}/package.json has no name`);
  return { name: parsed['name'], fields: parsed };
}

function versionsOf(manifest: PackageJson, field: string): Record<string, unknown> {
  const versions = manifest.fields[field];
  return isRecord(versions) ? versions : {};
}

function workspaceFolders(): string[] {
  return ['packages', 'extensions'].flatMap((parent) => {
    if (!existsSync(path.join(repositoryRoot, parent))) return [];
    const entries = readdirSync(path.join(repositoryRoot, parent), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(parent, entry.name));
  });
}

const exactVersion = /^(\d+\.\d+\.\d+|workspace:\*)$/;

describe('dependencies (CLAUDE.md §5, ADR 0009)', () => {
  it('M1.1-E30 every dependency is pinned exactly, and the root pins Node 24 and pnpm', () => {
    for (const folder of ['.', ...workspaceFolders()]) {
      const manifest = readPackage(folder);
      for (const [name, version] of Object.entries({ ...versionsOf(manifest, 'dependencies'), ...versionsOf(manifest, 'devDependencies') })) {
        expect(version, `${manifest.name}: ${name}`).toMatch(exactVersion);
      }
    }
    const root = readPackage('.');
    expect(versionsOf(root, 'engines')['node']).toBe('^24.0.0');
    expect(root.fields['packageManager']).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });

  it("M1.1-E31 the root devDependencies are exactly ADR 0009's tooling", () => {
    const tooling = versionsOf(readPackage('.'), 'devDependencies');
    expect(Object.keys(tooling).sort()).toEqual(['@changesets/cli', '@types/node', 'eslint', 'typescript', 'typescript-eslint', 'vite', 'vitest']);
    expect(tooling['typescript']).toBe('6.0.3');
  });
});
