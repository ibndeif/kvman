import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';

// The install as the documentation gives it (ADR 0026, 11 and 12): quiet, so npm shows its progress and no notices.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const read = (...parts: string[]): string => readFileSync(path.join(root, ...parts), 'utf8');
const quiet = '--no-fund --loglevel=error';

const markdownIn = (folder: string): string[] =>
  readdirSync(path.join(root, folder), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));

describe('the documented install (ADR 0026)', () => {
  it('QA38-H8 the pages that install kvman give the quiet command, and the install page explains the notices', () => {
    expect(read('README.md')).toContain(`npm i -g kvman ${quiet}\n`);
    expect(read('packages', 'cli', 'README.md')).toContain(`npm i -g kvman ${quiet}\n`);
    expect(read('docs', 'user-guide', 'README.md')).toContain(`npm i -g kvman ${quiet}\n`);
    expect(read('docs', 'developers', 'getting-started.md')).toContain(`npm i -g kvman @kvman/testkit ${quiet}\n`);

    const installing = read('docs', 'user-guide', 'installing.md');
    expect(installing).toContain(`npm i -g kvman ${quiet}\n`);
    expect(installing).toContain(`npm i -g kvman@latest ${quiet}\n`);
    for (const notice of ['looking for funding', 'node-domexception', 'allowScripts', "don't allow them"]) expect(installing).toContain(notice);
  });

  it('QA38-H9 kvai pins pi-ai at 1.0.4', () => {
    const manifest = z.object({ dependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(read('extensions', 'kvai', 'package.json')));
    expect(manifest.dependencies['@earendil-works/pi-ai']).toBe('1.0.4');
  });

  it('QA38-E7 no page gives the install without the flags', () => {
    const pages = ['README.md', ...markdownIn('docs'), ...['packages', 'extensions'].flatMap((folder) => readdirSync(path.join(root, folder)).map((name) => path.join(folder, name, 'README.md')))];
    for (const page of pages) {
      for (const line of read(page).split('\n').filter((candidate) => candidate.startsWith('npm i -g kvman'))) expect(line.endsWith(quiet), `${page}: ${line}`).toBe(true);
    }
  });
});
