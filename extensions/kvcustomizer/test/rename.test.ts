import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
