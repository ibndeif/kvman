import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const emptyPreset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };

async function homeKernel(bundled?: ReadonlyMap<string, string>) {
  const { root, home, homeFolder } = makeRoot(roots);
  const presetsDir = path.join(home, 'presets');
  const file = path.join(presetsDir, 'mine.json');
  writePresetFile(file, emptyPreset);
  const kernel = await startPresetKernel({
    home,
    homeFolder,
    preset: emptyPreset,
    presetFolder: presetsDir,
    presetSource: { origin: 'home', file },
    ...(bundled === undefined ? {} : { bundled }),
  });
  return { root, home, homeFolder, presetsDir, file, kernel };
}

function writeManifest(folder: string, manifest: string): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'package.json'), manifest);
}

const storedExtensions = (file: string) => presetSchema.parse(JSON.parse(readStoredFile(file))).extensions;

describe('install by source alone (02 §2.12, ADR 0025)', () => {
  it('QA37-H2 an npm source names the extension and stores its exact version', async () => {
    const { file, kernel } = await homeKernel();
    try {
      expect(await kernel.exec('kernel.extensions.install', { source: 'npm:@acme/notes@1.2.3' }, userCall())).toEqual({ file, restartRequired: true });
      expect(storedExtensions(file)).toEqual({ '@acme/notes': 'npm:1.2.3' });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-H3 a bundled source names the extension and stores bundled', async () => {
    const { file, kernel } = await homeKernel(new Map([['@kvman/kvcoder', 'bundled-kvcoder']]));
    try {
      await kernel.exec('kernel.extensions.install', { source: 'bundled:@kvman/kvcoder' }, userCall());
      expect(storedExtensions(file)).toEqual({ '@kvman/kvcoder': 'bundled' });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-H4 a path source takes the name from package.json and is stored as given', async () => {
    const { root, presetsDir, file, kernel } = await homeKernel();
    try {
      writeExtensionPackage(path.join(root, 'notes'), { name: '@test/notes', namespace: 'notes' });
      const relative = path.relative(presetsDir, path.join(root, 'notes')).split(path.sep).join('/');
      await kernel.exec('kernel.extensions.install', { source: `path:${relative}` }, userCall());
      expect(storedExtensions(file)).toEqual({ '@test/notes': `path:${relative}` });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-H5 an absolute folder works and is stored as given', async () => {
    const { root, file, kernel } = await homeKernel();
    try {
      const folder = path.join(root, 'notes');
      writeExtensionPackage(folder, { name: '@test/notes', namespace: 'notes' });
      await kernel.exec('kernel.extensions.install', { source: `path:${folder}` }, userCall());
      expect(storedExtensions(file)).toEqual({ '@test/notes': `path:${folder}` });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-H6 the bundled preset\'s first edit resolves a folder against <home>/presets', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    writeExtensionPackage(path.join(presetsDir, 'notes'), { name: '@test/notes', namespace: 'notes' });
    const kernel = await startPresetKernel({ home, homeFolder, preset: emptyPreset, presetFolder: root, presetSource: { origin: 'bundled' } });
    try {
      await kernel.exec('kernel.extensions.install', { source: 'path:notes' }, userCall());
      expect(storedExtensions(path.join(presetsDir, 'mine.json'))).toEqual({ '@test/notes': 'path:notes' });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-H7 the kernel checks the name only, not the kvman field', async () => {
    const { root, file, kernel } = await homeKernel();
    try {
      writeManifest(path.join(root, 'plain'), JSON.stringify({ name: '@test/plain', version: '1.0.0' }));
      await kernel.exec('kernel.extensions.install', { source: `path:${path.join(root, 'plain')}` }, userCall());
      expect(Object.keys(storedExtensions(file))).toEqual(['@test/plain']);
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E1 the old input and the old sources fail VALIDATION_FAILED and leave the file', async () => {
    const { file, kernel } = await homeKernel();
    try {
      const before = readStoredFile(file);
      const old = [{ name: '@acme/notes', source: 'npm:@acme/notes@1.2.3' }, { source: 'npm:1.2.3' }, { source: 'bundled' }];
      for (const input of old) {
        await expect(kernel.exec('kernel.extensions.install', input, userCall()), JSON.stringify(input)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      }
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E2 a source without a name or an exact version fails VALIDATION_FAILED', async () => {
    const { file, kernel } = await homeKernel();
    try {
      const before = readStoredFile(file);
      for (const source of ['npm:@acme/notes', 'npm:@acme/notes@^1.2.3', 'npm:not a name!@1.0.0', 'bundled:', 'path:', 'git:x', '']) {
        await expect(kernel.exec('kernel.extensions.install', { source }, userCall()), source).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      }
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E3 a bundled name that is not bundled fails VALIDATION_FAILED', async () => {
    const { kernel } = await homeKernel();
    try {
      await expect(kernel.exec('kernel.extensions.install', { source: 'bundled:@acme/a' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining('bundled') },
      });
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E4 a missing folder and a folder without package.json fail with the folder', async () => {
    const { root, file, kernel } = await homeKernel();
    try {
      const before = readStoredFile(file);
      mkdirSync(path.join(root, 'empty'));
      for (const folder of [path.join(root, 'missing'), path.join(root, 'empty')]) {
        await expect(kernel.exec('kernel.extensions.install', { source: `path:${folder}` }, userCall())).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { folder } },
        });
      }
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E5 a package.json that is not JSON, or has no usable name, fails VALIDATION_FAILED', async () => {
    const { root, file, kernel } = await homeKernel();
    try {
      const before = readStoredFile(file);
      const manifests = { broken: '{ not json', unnamed: '{}', badName: JSON.stringify({ name: 'not a name!' }) };
      for (const [folderName, manifest] of Object.entries(manifests)) {
        const folder = path.join(root, folderName);
        writeManifest(folder, manifest);
        await expect(kernel.exec('kernel.extensions.install', { source: `path:${folder}` }, userCall()), folderName).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { folder } },
        });
      }
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA37-E6 a name already in the preset fails VALIDATION_FAILED, from a path or an npm source', async () => {
    const { root, file, kernel } = await homeKernel();
    try {
      const folder = path.join(root, 'notes');
      writeExtensionPackage(folder, { name: '@test/notes', namespace: 'notes' });
      await kernel.exec('kernel.extensions.install', { source: `path:${folder}` }, userCall());
      const before = readStoredFile(file);
      for (const source of [`path:${folder}`, 'npm:@test/notes@1.0.0']) {
        await expect(kernel.exec('kernel.extensions.install', { source }, userCall()), source).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining('already in the preset') },
        });
      }
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });
});
