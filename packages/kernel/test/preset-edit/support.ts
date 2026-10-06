import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Preset, Problem } from '@kvman/sdk';
import { homeWorkspaceId, startKernel, type ExecOptions, type Kernel, type PresetSource } from '../../src/index.ts';

// Shared setup for the preset-edit tests (plan 02 §2.10): temporary roots, a tiny `path:` extension package, starting a
// real kernel with a given preset file, and reading the stored file back. Each test builds its own folders.

/** A temporary root with a kvman home and a Home workspace folder; the caller removes it after the test. */
export type PresetRoot = { root: string; home: string; homeFolder: string };

export function makeRoot(roots: string[]): PresetRoot {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-preset-edit-'));
  roots.push(root);
  const home = path.join(root, 'home');
  const homeFolder = path.join(root, 'home-folder');
  mkdirSync(home, { recursive: true });
  mkdirSync(homeFolder, { recursive: true });
  return { root, home, homeFolder };
}

/** What the tiny extension package looks like: its package name, namespace, version, and dependencies. */
export type ExtensionPackage = {
  name: string;
  namespace: string;
  version?: string;
  dependencies?: Record<string, string>;
};

export function writeExtensionPackage(folder: string, extension: ExtensionPackage): void {
  mkdirSync(folder, { recursive: true });
  const manifest = {
    name: extension.name,
    version: extension.version ?? '1.0.0',
    type: 'module',
    main: 'index.js',
    peerDependencies: { '@kvman/sdk': '^0.1.0' },
    kvman: { namespace: extension.namespace, ...(extension.dependencies === undefined ? {} : { dependencies: extension.dependencies }) },
  };
  writeFileSync(path.join(folder, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const query = `${extension.namespace}.ping`;
  writeFileSync(
    path.join(folder, 'index.js'),
    `import { z } from '@kvman/sdk';\nexport default (ctx) => {\n  ctx.registerQuery('${query}', {\n    description: 'Answers pong for the preset-edit tests.',\n    input: z.object({}),\n    output: z.object({ answer: z.string() }),\n    public: true,\n    handle: () => ({ answer: 'pong' }),\n  });\n};\n`,
  );
}

export function writePresetFile(file: string, preset: Preset): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(preset, null, 2)}\n`);
}

export function readStoredFile(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Starts a real kernel the way `leftovers.test.ts` does, with one worker and an always-trusting decision. */
export type StartPreset = {
  home: string;
  homeFolder: string;
  preset: Preset;
  presetFolder: string;
  presetSource?: PresetSource;
  bundled?: ReadonlyMap<string, string>;
  rolledBack?: Problem;
};

export function startPresetKernel(options: StartPreset): Promise<Kernel> {
  return startKernel({
    home: options.home,
    homeFolder: options.homeFolder,
    preset: options.preset,
    presetFolder: options.presetFolder,
    ...(options.presetSource === undefined ? {} : { presetSource: options.presetSource }),
    bundled: options.bundled ?? new Map(),
    mode: 'web',
    logLevel: 'error',
    terminalLog: false,
    startFolder: options.homeFolder,
    trust: () => Promise.resolve(true),
    ...(options.rolledBack === undefined ? {} : { rolledBack: options.rolledBack }),
  });
}

/** Calls a job as the user in Home, as `leftovers.test.ts` starts its kernel for. */
export function userCall(): ExecOptions {
  return { caller: { kind: 'user' }, workspaceId: homeWorkspaceId };
}

/** Calls a job as an extension in Home, to check that a public registration answers it. */
export function extensionCall(name: string): ExecOptions {
  return { caller: { kind: 'extension', name }, workspaceId: homeWorkspaceId };
}
