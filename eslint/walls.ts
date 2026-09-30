import path from 'node:path';
import { isExportedSubpathFile, isTestFile, isToolingFile, type Unit, type Workspace } from './workspace.ts';

// The import walls of plan 01 §1.4. Each check returns the reason an import breaks a wall, or undefined.

type PackageWall = {
  kvmanPackages: readonly string[];
  thirdParty: 'declared' | readonly string[];
  nodeBuiltins: boolean;
};

const packageWalls: Record<string, PackageWall> = {
  sdk: { kvmanPackages: [], thirdParty: ['zod'], nodeBuiltins: false },
  kernel: { kvmanPackages: ['sdk'], thirdParty: 'declared', nodeBuiltins: true },
  cli: { kvmanPackages: ['kernel', 'sdk'], thirdParty: [], nodeBuiltins: true },
  testkit: { kvmanPackages: ['kernel', 'sdk'], thirdParty: [], nodeBuiltins: true },
};

const extensionWall: PackageWall = { kvmanPackages: ['sdk'], thirdParty: 'declared', nodeBuiltins: true };

const testTools: readonly string[] = ['vitest', '@playwright/test'];

export type ImportUse = { specifier: string; typeOnly: boolean; fromFile: string };

type Context = { unit: Unit; wall: PackageWall; use: ImportUse; inTest: boolean };

const reference = '(plan 01 §1.4)';

function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, nameLength).join('/'), subpath: parts.slice(nameLength).join('/') };
}

function checkRelative({ unit, use }: Context, subpathFile: boolean): string | undefined {
  const target = path.resolve(path.dirname(use.fromFile), use.specifier);
  const inside = path.relative(unit.root, target);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    return `"${use.specifier}" leaves ${unit.label}; import another package by its name ${reference}`;
  }
  if (subpathFile && !use.typeOnly) return `an exported subpath imports only @kvman/sdk, not "${use.specifier}" ${reference}`;
  return undefined;
}

function checkNodeBuiltin({ unit, wall, use, inTest }: Context, subpathFile: boolean): string | undefined {
  if (subpathFile) return `an exported subpath imports only @kvman/sdk, not "${use.specifier}" ${reference}`;
  if (wall.nodeBuiltins || inTest) return undefined;
  return `${unit.label} may not import a Node built-in ("${use.specifier}") ${reference}`;
}

function checkExtensionTarget({ unit, use }: Context, target: Unit, subpath: string): string | undefined {
  const name = target.manifest.name;
  if (!unit.manifest.kvmanDependencies.includes(name)) {
    return `${unit.label} may import ${name} only when it is a kvman.dependencies entry ${reference}`;
  }
  if (use.typeOnly || subpath !== '') return undefined;
  return `${unit.label} may import ${name} at runtime only through a subpath it exports; use "import type" for its types ${reference}`;
}

function checkKvmanPackage(context: Context, target: Unit, subpath: string, subpathFile: boolean): string | undefined {
  const { unit, wall, use, inTest } = context;
  const name = target.manifest.name;
  if (subpath !== '' && !target.manifest.exportedSubpaths.has(`./${subpath}`)) {
    return `import ${name} only through an entry point it exports, not "${use.specifier}" ${reference}`;
  }
  if (subpathFile) {
    return target.kind === 'package' && target.folder === 'sdk' ? undefined : `an exported subpath imports only @kvman/sdk, not "${use.specifier}" ${reference}`;
  }
  if (target.kind === 'extension' && unit.kind === 'extension') return checkExtensionTarget(context, target, subpath);
  const allowed = target.kind === 'package' && (wall.kvmanPackages.includes(target.folder) || (inTest && unit.kind === 'extension' && target.folder === 'testkit'));
  return allowed ? undefined : `${unit.label} may not import ${name} ${reference}`;
}

function checkThirdParty({ unit, wall, use, inTest }: Context, name: string, subpathFile: boolean): string | undefined {
  if (subpathFile) return `an exported subpath imports only @kvman/sdk, not "${use.specifier}" ${reference}`;
  if (inTest && testTools.includes(name)) return undefined;
  if (wall.thirdParty !== 'declared' && !wall.thirdParty.includes(name)) {
    const only = wall.thirdParty.length === 0 ? 'no third-party package' : `only ${wall.thirdParty.join(', ')}`;
    return `${unit.label} may import ${only}, not "${use.specifier}" ${reference}`;
  }
  const declared = [...unit.manifest.dependencies, ...(inTest ? unit.manifest.devDependencies : [])];
  if (declared.includes(name)) return undefined;
  return `${unit.label} does not declare "${name}" in its package.json ${reference}`;
}

export function checkImport(workspace: Workspace, unit: Unit | string, use: ImportUse): string | undefined {
  if (typeof unit === 'string') return `${unit} has no import wall; add it to eslint/walls.ts ${reference}`;
  const wall = unit.kind === 'extension' ? extensionWall : packageWalls[unit.folder];
  if (wall === undefined) return `${unit.label} has no import wall; add it to eslint/walls.ts ${reference}`;
  const context = { unit, wall, use, inTest: isTestFile(unit, use.fromFile) || isToolingFile(unit, use.fromFile) };
  const subpathFile = isExportedSubpathFile(unit, use.fromFile);
  if (use.specifier.startsWith('.')) return checkRelative(context, subpathFile);
  if (use.specifier.startsWith('node:')) return checkNodeBuiltin(context, subpathFile);
  const { name, subpath } = splitSpecifier(use.specifier);
  const target = workspace.byName.get(name);
  if (target !== undefined) return checkKvmanPackage(context, target, subpath, subpathFile);
  return checkThirdParty(context, name, subpathFile);
}
