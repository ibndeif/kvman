import type { PackageJson } from '@kvman/protocol';
import { scanImports } from '../../src/index.ts';
import { describe, expect, it } from 'vitest';
import { failure, tree } from './trees.ts';

const packageJson: PackageJson = { name: '@acme/sample', dependencies: { lodash: '4.0.0', '@scope/tool': '1.0.0' }, peerDependencies: { '@kvman/sdk': '*' } };

function scan(files: Record<string, string>): Promise<unknown> {
  return scanImports(tree(files), packageJson);
}

describe('the undeclared-import scan (plan 06 §6.2, ADR 0117)', () => {
  it('M2.2-E15 built-ins, relative files inside the package, and declared packages pass', async () => {
    const source = [
      "import fs from 'node:fs';", "import path from 'path';", "import a from './lib/a.js';", "import lodash from 'lodash/fp.js';",
      "import { defineExtension } from '@kvman/sdk';", "import tool from '@scope/tool/sub';", 'console.log(import.meta.url, fs, path, a, lodash, defineExtension, tool);',
    ].join('\n');
    expect(await scan({ 'dist/extension.js': source, 'dist/lib/a.js': "import b from '../lib/b.js'; export default b;", 'dist/lib/b.js': 'export default 1;' })).toEqual([]);
  });

  it('M2.2-E16 every other form fails, naming the file and the specifier', async () => {
    for (const specifier of ['left-pad', '@acme/sample', '#internal', '/abs/x.js', 'file:///x.js', 'https://x/y.js', 'data:text/javascript,', '../../outside.js']) {
      const result = await failure(scan({ 'dist/extension.js': `import x from '${specifier}'; export default x;` }));
      expect(result).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { params: { file: 'dist/extension.js', specifier } } });
    }
    expect(await failure(scan({ 'dist/extension.js': "import x from 'left-pad';" }))).toMatchObject({ details: { detail: 'dist/extension.js imports left-pad, which package.json does not declare' } });
  });

  it('M2.2-E17 a computed dynamic import is a warning; a literal undeclared one fails', async () => {
    expect(await scan({ 'dist/extension.js': 'const name = "x"; export const load = () => import(name);' })).toEqual([
      { path: 'dist/extension.js', message: 'a dynamic import with a computed specifier cannot be checked', code: 'DYNAMIC_IMPORT', severity: 'warning' },
    ]);
    expect(await failure(scan({ 'dist/extension.js': "export const load = () => import('undeclared');" }))).toMatchObject({ details: { params: { specifier: 'undeclared' } } });
  });

  it('M2.2-E18 require() in .cjs files and the files of dependencies are not scanned', async () => {
    expect(await scan({ 'dist/extension.cjs': "module.exports = require('undeclared');", 'node_modules/dep/index.js': "import x from 'undeclared'; export default x;" })).toEqual([]);
  });

  it('M2.2-E19 a file that cannot be lexed is refused', async () => {
    expect(await failure(scan({ 'dist/broken.mjs': 'import { from "x";' }))).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { detail: 'dist/broken.mjs cannot be parsed' } });
  });
});
