import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The workspace as the import walls see it: every package and extension, read from its package.json.

export type Manifest = {
  name: string;
  dependencies: readonly string[];
  devDependencies: readonly string[];
  kvmanDependencies: readonly string[];
  exportedSubpaths: ReadonlyMap<string, readonly string[]>;
};

export type Unit = {
  kind: 'package' | 'extension';
  folder: string;
  label: string;
  root: string;
  manifest: Manifest;
};

export type Workspace = { root: string; units: readonly Unit[]; byName: ReadonlyMap<string, Unit> };

const unitFolders = { packages: 'package', extensions: 'extension' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keysOf(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

// An export target is a path or an object of conditions; every path it can resolve to counts.
function targetPaths(root: string, target: unknown): string[] {
  if (typeof target === 'string') return [path.resolve(root, target)];
  return isRecord(target) ? Object.values(target).flatMap((value) => targetPaths(root, value)) : [];
}

function readExports(root: string, exported: unknown): Map<string, string[]> {
  if (!isRecord(exported) || !Object.keys(exported).every((key) => key.startsWith('.'))) {
    return new Map([['.', targetPaths(root, exported)]]);
  }
  return new Map(Object.entries(exported).map(([subpath, target]) => [subpath, targetPaths(root, target)]));
}

function readManifest(root: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!isRecord(parsed) || typeof parsed['name'] !== 'string') {
    throw new Error(`${path.join(root, 'package.json')} has no name`);
  }
  const kvman = parsed['kvman'];
  return {
    name: parsed['name'],
    dependencies: keysOf(parsed['dependencies']),
    devDependencies: keysOf(parsed['devDependencies']),
    kvmanDependencies: isRecord(kvman) ? keysOf(kvman['dependencies']) : [],
    exportedSubpaths: readExports(root, parsed['exports']),
  };
}

function readUnits(root: string, folder: keyof typeof unitFolders): Unit[] {
  const parent = path.join(root, folder);
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(parent, entry.name, 'package.json')))
    .map((entry) => {
      const unitRoot = path.join(parent, entry.name);
      return { kind: unitFolders[folder], folder: entry.name, label: `${folder}/${entry.name}`, root: unitRoot, manifest: readManifest(unitRoot) };
    });
}

const workspaces = new Map<string, Workspace>();

export function readWorkspace(root: string): Workspace {
  const known = workspaces.get(root);
  if (known !== undefined) return known;
  const units = [...readUnits(root, 'packages'), ...readUnits(root, 'extensions')];
  const workspace = { root, units, byName: new Map(units.map((unit) => [unit.manifest.name, unit])) };
  workspaces.set(root, workspace);
  return workspace;
}

// The unit a file belongs to, or a label for a folder under packages/ or extensions/ that has no package.json.
export function unitOf(workspace: Workspace, file: string): Unit | string | undefined {
  const [folder, name] = path.relative(workspace.root, file).split(path.sep);
  if (folder === undefined || name === undefined || !(folder in unitFolders)) return undefined;
  const unit = workspace.units.find((candidate) => candidate.label === `${folder}/${name}`);
  return unit ?? `${folder}/${name}`;
}

export function isTestFile(unit: Unit, file: string): boolean {
  return path.relative(unit.root, file).split(path.sep)[0] === 'test' || file.endsWith('.test.ts');
}

// A package's own build or test tool config at its top level (`vite.config.ts`, `vitest.web.config.ts`): like a test,
// it runs only at build or test time, so it may import devDependencies.
export function isToolingFile(unit: Unit, file: string): boolean {
  const inside = path.relative(unit.root, file);
  return !inside.includes(path.sep) && inside.endsWith('.config.ts');
}

// A file that an extension's package.json exports under a subpath other than its root.
export function isExportedSubpathFile(unit: Unit, file: string): boolean {
  if (unit.kind !== 'extension') return false;
  return [...unit.manifest.exportedSubpaths].some(([subpath, files]) => subpath !== '.' && files.includes(file));
}
