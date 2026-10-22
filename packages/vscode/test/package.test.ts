import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// The packed extension (plan 15 §15.8, ADR 0099, 12 and 41): `pnpm vscode:package` builds the folder VS Code loads and
// packs it, and `vsce ls` lists what went in.

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const staged = fileURLToPath(new URL('../dist/extension/', import.meta.url));
const vsix = fileURLToPath(new URL('../dist/kvman.vsix', import.meta.url));
const vsce = fileURLToPath(new URL('../node_modules/.bin/vsce', import.meta.url));

describe('the packed extension (15 §15.8, ADR 0099, 41)', { timeout: 120_000 }, () => {
  it('M4.3-H1 pnpm vscode:package writes the .vsix with one bundled file, the manifest at the root version, and no node_modules', () => {
    execFileSync('pnpm', ['vscode:package'], { cwd: repository, stdio: 'ignore', shell: process.platform === 'win32' });
    expect(existsSync(vsix)).toBe(true);
    const packed = execFileSync(vsce, ['ls', '--no-dependencies'], { cwd: staged, encoding: 'utf8', shell: process.platform === 'win32' }).trim().split('\n').sort();
    expect(packed).toEqual(['LICENSE', 'README.md', 'extension.js', 'media/icon.png', 'media/view.svg', 'package.json', 'package.nls.ar.json', 'package.nls.json', 'page.css', 'page/relay.js']);
    const manifest = z.object({ name: z.string(), publisher: z.string(), version: z.string() }).parse(JSON.parse(readFileSync(`${staged}package.json`, 'utf8')));
    const rootVersion = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(`${repository}package.json`, 'utf8'))).version;
    expect(manifest).toEqual({ name: 'kvman', publisher: 'ibndeif', version: rootVersion });
    expect(readFileSync(`${staged}extension.js`, 'utf8')).toContain('require("vscode")');
  });
});
