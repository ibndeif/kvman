import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runKvman, startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();
const cliFolder = fileURLToPath(new URL('../../', import.meta.url));

// A fake `npm`, first on the child's PATH: it logs its arguments, and `root -g` answers a folder whose `kvman` is a
// link to this repository's CLI package, so the child's check finds itself there. It removes nothing.
function fakeNpm(root: string): { bin: string; log: string; env: Record<string, string> } {
  const bin = path.join(root, 'bin');
  const globalFolder = path.join(root, 'global');
  const log = path.join(root, 'npm.log');
  mkdirSync(bin);
  mkdirSync(globalFolder);
  symlinkSync(cliFolder, path.join(globalFolder, 'kvman'), process.platform === 'win32' ? 'junction' : 'dir');
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'npm.cmd'), '@echo off\r\necho %* >> "%FAKE_NPM_LOG%"\r\nif "%1"=="root" echo %FAKE_NPM_ROOT%\r\n');
  } else {
    const script = path.join(bin, 'npm');
    writeFileSync(script, '#!/bin/sh\necho "$@" >> "$FAKE_NPM_LOG"\nif [ "$1" = root ]; then echo "$FAKE_NPM_ROOT"; fi\n');
    chmodSync(script, 0o755);
  }
  return { bin, log, env: { FAKE_NPM_LOG: log, FAKE_NPM_ROOT: globalFolder, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` } };
}

describe('kvman uninstall, as the real program (ADR 0031)', { timeout: 90_000 }, () => {
  it('QA43-H11 it stops a real kvman, runs npm, and keeps the data', async () => {
    const world = sandbox();
    const npm = fakeNpm(world.root);
    const running = await startKvman(world, ['--preset', world.appPreset()]);
    const uninstall = await runKvman(world, ['uninstall', '--home', world.home, '--yes'], { defaults: false, env: npm.env });
    expect(uninstall.errors).toBe('');
    expect(uninstall.output).toBe(`This removes kvman from this computer.\nkvman is running and will be stopped.\nkvman was removed. Your data was kept in ${world.home}\n`);
    expect(uninstall.code).toBe(0);
    await running.exit;
    expect(readFileSync(npm.log, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')).toEqual(['root -g', 'uninstall -g kvman']);
    expect(existsSync(path.join(world.home, 'kvman.db'))).toBe(true);
  });
});
