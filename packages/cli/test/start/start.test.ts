import { chmodSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { api, childWait, outputOf } from '../support/api.ts';
import { runKvman, startKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();
const kvmanVersion = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))).version;

// A fake browser command first on the PATH, which records the URL it's given and exits with `exitCode`.
function fakeBrowser(world: Sandbox, exitCode: number): { env: Record<string, string>; opened: string } {
  if (process.platform === 'win32') throw new Error('Windows opens URLs through cmd, which has no fake on the PATH.');
  const bin = world.folder('bin');
  const opened = path.join(world.root, 'opened.txt');
  const script = path.join(bin, process.platform === 'darwin' ? 'open' : 'xdg-open');
  writeFileSync(script, `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\nexit ${String(exitCode)}\n`);
  chmodSync(script, 0o755);
  return { env: { PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }, opened };
}

describe('starting kvman (01 §1.2)', { timeout: 60_000 }, () => {
  it('M1.8-H1 kvman --preset <file> prints, and opens, the URL of its start folder', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const kvman = await startKvman(world, ['--preset', preset]);
    const workspaces = outputOf(await api(kvman.port).query('kernel.workspace.list', {}));
    expect(workspaces).toContainEqual({ id: kvman.workspaceId, name: 'start', path: realpathSync(world.start) });
    expect(kvman.url).toBe(`http://127.0.0.1:${String(kvman.port)}/?workspace=${kvman.workspaceId}`);
    const browser = fakeBrowser(world, 0);
    const opening = await startKvman(world, ['--home', path.join(world.root, 'second-home'), '--port', '0', '--yes', '--preset', preset], { defaults: false, env: browser.env });
    await vi.waitFor(() => expect(readFileSync(browser.opened, 'utf8')).toBe(opening.url), childWait);
  });

  it('M1.8-H7 a taken port fails PORT_IN_USE, and the lock is removed', async () => {
    const world = sandbox();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      const result = await runKvman(world, ['--home', world.home, '--no-open', '--yes', '--port', String(port), '--preset', world.appPreset()], { defaults: false });
      expect(result.code).toBe(1);
      expect(result.errors).toContain(`PORT_IN_USE: The port ${String(port)} is already in use.`);
      expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
    } finally {
      server.close();
    }
  });

  it('M1.8-E1 --help prints the usage and --version the version, each exiting 0', async () => {
    const world = sandbox();
    const help = await runKvman(world, ['--help'], { defaults: false });
    expect(help).toMatchObject({ code: 0, errors: '' });
    expect(help.output).toContain('kvman [--mode web] [--preset coder]');
    const version = await runKvman(world, ['--version'], { defaults: false });
    expect(version).toEqual({ code: 0, output: `${kvmanVersion}\n`, errors: '' });
  });

  it('M1.8-E9 kvman started in its user folder prints the URL of Home', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()], { cwd: world.user });
    expect(kvman.workspaceId).toBe('home');
  });

  it('M1.8-E22 a browser that fails to open is logged as a warning, and kvman keeps answering', async () => {
    const world = sandbox();
    const browser = fakeBrowser(world, 1);
    const kvman = await startKvman(world, ['--home', world.home, '--port', '0', '--yes', '--preset', world.appPreset()], { defaults: false, env: browser.env });
    await vi.waitFor(() => expect(kvman.errors()).toMatch(/\d\d:\d\d:\d\d WARN The browser could not be opened\./), childWait);
    expect(readFileSync(path.join(world.home, 'logs', 'kvman.log'), 'utf8')).toContain('The browser could not be opened.');
    expect(await api(kvman.port).command('app.echo', { text: 'still here' })).toMatchObject({ ok: true, output: { text: 'still here' } });
  });
});
