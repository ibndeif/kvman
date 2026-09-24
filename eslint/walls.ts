import path from 'node:path';

export const internalPackageNames = [
  'protocol', 'sdk', 'kernel', 'testkit', 'shell', 'widget-bridge', 'cli', 'devtools',
] as const;

type Wall = {
  internalPackages: readonly string[];
  internalPackageTypesOnly: readonly string[];
  internalPackagesInTests: readonly string[];
  thirdPartyAllowList: readonly string[] | 'any';
  nodeBuiltins: boolean;
};

const openWall = { internalPackageTypesOnly: [], internalPackagesInTests: [], thirdPartyAllowList: 'any', nodeBuiltins: true } as const;

const packageWalls: Record<string, Wall> = {
  protocol: { ...openWall, internalPackages: [], thirdPartyAllowList: ['zod'], nodeBuiltins: false },
  sdk: { ...openWall, internalPackages: ['protocol'] },
  kernel: { ...openWall, internalPackages: ['protocol'], internalPackageTypesOnly: ['sdk'] },
  testkit: { ...openWall, internalPackages: ['kernel', 'sdk', 'protocol'] },
  shell: { ...openWall, internalPackages: ['protocol'] },
  'widget-bridge': { ...openWall, internalPackages: ['protocol'] },
  cli: { ...openWall, internalPackages: ['protocol'] },
  devtools: { ...openWall, internalPackages: ['protocol', 'testkit'] },
};

const extensionWall: Wall = { ...openWall, internalPackages: ['sdk', 'protocol'], internalPackagesInTests: ['testkit'] };

export type WorkspaceUnit = { label: string; root: string; wall: Wall | undefined };

export type ImportUse = { specifier: string; typeOnly: boolean; fromFile: string };

const unitFolders = ['packages', 'extensions', 'examples'];

const testTools: readonly string[] = ['vitest', 'fast-check', '@playwright/test'];

export function findWorkspaceUnit(repositoryRoot: string, file: string): WorkspaceUnit | undefined {
  const [folder, name] = path.relative(repositoryRoot, file).split(path.sep);
  if (folder === undefined || name === undefined || !unitFolders.includes(folder)) return undefined;
  const wall = folder === 'packages' ? packageWalls[name] : extensionWall;
  return { label: `${folder}/${name}`, root: path.join(repositoryRoot, folder, name), wall };
}

function isTestFile(unit: WorkspaceUnit, file: string): boolean {
  const inside = path.relative(unit.root, file).split(path.sep);
  return inside[0] === 'test' || file.endsWith('.test.ts');
}

function splitPackageSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, nameLength).join('/'), subpath: parts.slice(nameLength).join('/') };
}

function checkRelative(unit: WorkspaceUnit, use: ImportUse): string | undefined {
  const target = path.resolve(path.dirname(use.fromFile), use.specifier);
  const inside = path.relative(unit.root, target);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    return `"${use.specifier}" leaves ${unit.label}; import another package by its name (plan 01 §1.5)`;
  }
  return undefined;
}

function checkKvmanPackage(unit: WorkspaceUnit, wall: Wall, use: ImportUse, name: string, subpath: string): string | undefined {
  if (subpath !== '') {
    return `import ${name} only through its public entry point, not "${use.specifier}" (plan 01 §1.5)`;
  }
  const shortName = name.slice('@kvman/'.length);
  const allowed = [
    ...wall.internalPackages,
    ...(isTestFile(unit, use.fromFile) ? wall.internalPackagesInTests : []),
    ...(use.typeOnly ? wall.internalPackageTypesOnly : []),
  ];
  if (allowed.includes(shortName)) return undefined;
  if (wall.internalPackageTypesOnly.includes(shortName)) {
    return `${unit.label} may import ${name} for types only: use "import type" (plan 01 §1.5)`;
  }
  return `${unit.label} may not import ${name} (plan 01 §1.5)`;
}

export function checkImport(unit: WorkspaceUnit, use: ImportUse): string | undefined {
  const wall = unit.wall;
  if (wall === undefined) return `${unit.label} has no import wall; add it to eslint/walls.ts (plan 01 §1.5)`;
  if (use.specifier.startsWith('.')) return checkRelative(unit, use);
  if (use.specifier.startsWith('node:')) {
    return wall.nodeBuiltins ? undefined : `${unit.label} has no I/O and may not import "${use.specifier}" (plan 01 §1.5)`;
  }
  const { name, subpath } = splitPackageSpecifier(use.specifier);
  if (name.startsWith('@kvman/')) return checkKvmanPackage(unit, wall, use, name, subpath);
  if (wall.thirdPartyAllowList === 'any' || wall.thirdPartyAllowList.includes(name)) return undefined;
  if (isTestFile(unit, use.fromFile) && testTools.includes(name)) return undefined;
  return `${unit.label} may import only ${wall.thirdPartyAllowList.join(', ')}, not "${use.specifier}" (plan 01 §1.5)`;
}
