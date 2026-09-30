import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { Preset } from '@kvman/sdk';
import { appEntry } from './app-extension.ts';

// A temporary world for one kvman child: its home, the user folder its HOME points to (so Home is never the real one),
// the folder it starts in, and the test's extensions and presets. Children still running after a test are killed, and
// the folders removed.

export type TestExtension = { name: string; namespace: string; version?: string; entry: string; web?: boolean; files?: Record<string, string> };

export type Sandbox = {
  root: string;
  home: string;
  user: string;
  start: string;
  // A new folder inside the sandbox.
  folder(name: string): string;
  writeExtension(extension: TestExtension): string;
  // Writes `<root>/<file>` and returns its path.
  writePreset(file: string, preset: Preset): string;
  // Writes the app extension and a preset of it (kernel.web.home `app`, one worker) with extra settings.
  appPreset(settings?: Preset['settings'], file?: string): string;
  // Tracks a child process to kill after the test.
  track(kill: () => Promise<void>): void;
};

export const appExtension: TestExtension = {
  name: '@test/app',
  namespace: 'app',
  entry: appEntry,
  web: true,
  files: {
    'web/index.html': '<!doctype html><title>app</title>',
    'web/nested/page.js': 'export const page = 1;',
    'locales/en.json': JSON.stringify({ 'app.title': 'App' }),
    'locales/ar.json': JSON.stringify({ 'app.title': 'تطبيق' }),
  },
};

function writeFiles(folder: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    writeFileSync(path.join(folder, file), content);
  }
}

function createSandbox(roots: string[], kills: (() => Promise<void>)[]): Sandbox {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-cli-'));
  roots.push(root);
  const folder = (name: string): string => {
    const created = path.join(root, name);
    mkdirSync(created, { recursive: true });
    return created;
  };
  const sandbox: Sandbox = {
    root,
    home: path.join(root, 'home'),
    user: folder('user'),
    start: folder('start'),
    folder,
    writeExtension: (extension) => {
      const extensionFolder = folder(extension.namespace);
      const kvman = { namespace: extension.namespace, source: 'index.ts', ...(extension.web === true ? { web: 'web' } : {}) };
      const manifest = { name: extension.name, version: extension.version ?? '1.0.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman };
      writeFiles(extensionFolder, { 'package.json': JSON.stringify(manifest), 'index.ts': extension.entry, ...extension.files });
      return extensionFolder;
    },
    writePreset: (file, preset) => {
      const written = path.join(root, file);
      writeFileSync(written, JSON.stringify(preset));
      return written;
    },
    appPreset: (settings = {}, file = 'preset.json') => {
      sandbox.writeExtension(appExtension);
      return sandbox.writePreset(file, { name: 'one', extensions: { '@test/app': 'path:./app' }, settings: { 'kernel.web.home': 'app', 'kernel.workers': 1, ...settings } });
    },
    track: (kill) => kills.push(kill),
  };
  return sandbox;
}

// A symbolic link inside the app's web folder to a file outside it.
export function linkOutOfWeb(sandbox: Sandbox): void {
  writeFileSync(path.join(sandbox.root, 'secret.txt'), 'outside');
  symlinkSync(path.join(sandbox.root, 'secret.txt'), path.join(sandbox.root, 'app', 'web', 'link.txt'));
}

export function useSandbox(): () => Sandbox {
  const roots: string[] = [];
  const kills: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const kill of kills.splice(0)) await kill();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return () => createSandbox(roots, kills);
}
