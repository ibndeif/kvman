import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

// A project that depends on installed extensions (ADR 0080, 4): `notes` in a temporary folder, with `@test/base` (which
// depends on `@test/root`) in its `node_modules`, as `npm install --save-dev` puts them. The installed ones have a
// JavaScript `main` and no `src/`, as a published extension has. Removed after each test.

export type InstalledExtension = { name: string; namespace: string; version?: string; dependencies?: Record<string, string>; main: string };

const rootExtension: InstalledExtension = {
  name: '@test/root',
  namespace: 'root',
  main: `import { z } from '@kvman/sdk';
export default (ctx) => {
  ctx.registerQuery('root.value.get', { description: 'Gives the root value.', public: true, input: z.object({}), output: z.object({ value: z.string() }), handle: () => ({ value: 'root' }) });
};
`,
};

export const baseExtension: InstalledExtension = {
  name: '@test/base',
  namespace: 'base',
  dependencies: { '@test/root': '^0.1.0' },
  main: `import { z } from '@kvman/sdk';
export default (ctx) => {
  ctx.registerQuery('base.where.get', { description: 'Says where base was loaded from.', public: true, input: z.object({}), output: z.object({ where: z.string() }), handle: () => ({ where: 'installed' }) });
};
`,
};

export const installedExtensions: readonly InstalledExtension[] = [rootExtension, baseExtension];

export const notesSource = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('notes.base.get', {
    description: 'Gives where base was loaded from, through its public query.',
    public: true,
    input: z.object({}),
    output: z.object({ where: z.string() }),
    handle: async () => z.object({ where: z.string() }).parse(await ctx.exec('base.where.get', {})),
  });
};
`;

function manifest(extension: { name: string; namespace: string; version?: string; dependencies?: Record<string, string> }, entry: Record<string, string>): string {
  const kvman = { namespace: extension.namespace, dependencies: extension.dependencies ?? {}, ...(entry['source'] === undefined ? {} : { source: entry['source'] }) };
  return JSON.stringify({ name: extension.name, version: extension.version ?? '0.1.0', type: 'module', main: entry['main'], peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman });
}

/** Writes an installed extension into `<project>/node_modules/<name>`. */
export function install(project: string, extension: InstalledExtension): string {
  const folder = path.join(project, 'node_modules', extension.name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'package.json'), manifest(extension, { main: 'index.js' }));
  writeFileSync(path.join(folder, 'index.js'), extension.main);
  return folder;
}

export type DependencyProjects = {
  /** The `notes` project declaring `dependencies`, with `installed` in its `node_modules`. */
  project(dependencies: Record<string, string>, installed: readonly InstalledExtension[]): string;
  /** A `path:` folder of `@test/base` inside `project`, whose `kvman.source` says it came from its folder. */
  baseFolder(project: string): string;
};

export function useDependencyProjects(): DependencyProjects {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const root = (): string => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-dependencies-'));
    roots.push(folder);
    return folder;
  };
  return {
    project: (dependencies, installed) => {
      const folder = path.join(root(), 'notes');
      mkdirSync(path.join(folder, 'src'), { recursive: true });
      mkdirSync(path.join(folder, 'locales'));
      writeFileSync(path.join(folder, 'package.json'), manifest({ name: 'notes', namespace: 'notes', dependencies }, { main: 'dist/index.js', source: 'src/index.ts' }));
      writeFileSync(path.join(folder, 'src', 'index.ts'), notesSource);
      writeFileSync(path.join(folder, 'locales', 'en.json'), JSON.stringify({ 'notes.title': 'Notes' }));
      writeFileSync(path.join(folder, 'locales', 'ar.json'), JSON.stringify({ 'notes.title': 'ملاحظات' }));
      for (const extension of installed) install(folder, extension);
      return folder;
    },
    baseFolder: (project) => {
      const folder = path.join(project, 'packages', 'base');
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, 'package.json'), manifest(baseExtension, { main: 'dist/index.js', source: 'index.ts' }));
      writeFileSync(path.join(folder, 'index.ts'), baseExtension.main.replace("where: 'installed'", "where: 'folder'"));
      return folder;
    },
  };
}
