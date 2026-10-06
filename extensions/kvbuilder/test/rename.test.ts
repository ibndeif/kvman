import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();

// The old name, built so this file doesn't hold it.
const oldName = 'kv' + 'dev';

const repositoryRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

function walk(folder: string, files: string[]): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
}

function interestingRoots(): string[] {
  const roots: string[] = [];
  for (const area of ['extensions', 'packages']) {
    const base = path.join(repositoryRoot, area);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const folder = path.join(base, name);
      if (!statSync(folder).isDirectory() || name === 'node_modules') continue;
      for (const sub of ['src', 'test', 'locales', 'docs', 'templates']) {
        const candidate = path.join(folder, sub);
        if (existsSync(candidate) && statSync(candidate).isDirectory()) roots.push(candidate);
      }
      const manifest = path.join(folder, 'package.json');
      if (existsSync(manifest)) roots.push(manifest);
    }
  }
  const presets = path.join(repositoryRoot, 'presets');
  if (existsSync(presets)) roots.push(presets);
  return roots;
}

describe('the rename (ADR 0010, 4)', () => {
  it('QA17-H14 no package, preset, catalog, doc, or test still names the old extension, and its preset is gone', () => {
    const self = fileURLToPath(import.meta.url);
    const files: string[] = [];
    for (const root of interestingRoots()) {
      if (root.endsWith('package.json')) files.push(root);
      else walk(root, files);
    }
    const hits: string[] = [];
    for (const file of files) {
      if (file === self) continue;
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (text.toLowerCase().includes(oldName)) hits.push(path.relative(repositoryRoot, file));
    }
    expect(hits).toEqual([]);
    expect(existsSync(path.join(repositoryRoot, 'presets', 'dev.json'))).toBe(false);
  });
});

describe('kvcustomizer is kvbuilder (ADR 0027, 7)', { timeout: 30_000 }, () => {
  it('QA39-H9 the extension is @kvman/kvbuilder with the namespace kvbuilder, shown as kvman builder, and coder lists it', async () => {
    const { kernel } = await kvbuilder.start();
    const extensions = await kernel.exec('kernel.extensions.list', {});
    const own = extensions.find((extension) => extension.name === '@kvman/kvbuilder');
    expect(own?.namespace).toBe('kvbuilder');
    expect(extensions.map((extension) => extension.name)).not.toContain('@kvman/kvcustomizer');
    const names = [...(own?.commands ?? []), ...(own?.queries ?? [])].map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !name.startsWith('kvbuilder.'))).toEqual([]);
    const json = (file: string): unknown => JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8'));
    expect(json('extensions/kvbuilder/locales/en.json')).toMatchObject({ 'kvbuilder.title': 'kvman builder' });
    expect(json('extensions/kvbuilder/locales/ar.json')).toMatchObject({ 'kvbuilder.title': 'kvman builder' });
    expect(json('packages/cli/presets/coder.json')).toMatchObject({ extensions: { '@kvman/kvbuilder': 'bundled' } });
  });
});
