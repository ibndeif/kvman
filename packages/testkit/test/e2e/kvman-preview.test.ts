import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFakeLog } from '../support/fake-kvman.ts';
import { pidAlive, previewHomePath, usePreviewSandbox, waitForFile, type PreviewHandle } from '../support/preview-world.ts';

// `kvman-preview` against a fake kvman (09 §9.3, ADR 0010, 7, 21): the bin starts the entry with its own home, port,
// and generated preset, prints one URL line once health answers, and stops everything on a signal.
const makeSandbox = usePreviewSandbox();

const webScripts = { 'web:build': 'node build.cjs', 'web:watch': 'node watch.cjs' };

function previewPortOf(url: string): number {
  const match = /^http:\/\/127\.0\.0\.1:(\d+)\/$/.exec(url);
  expect(match).not.toBeNull();
  const port = Number(match?.[1]);
  expect(port).toBeGreaterThanOrEqual(3738);
  expect(port).toBeLessThanOrEqual(3837);
  return port;
}

function expectedArgs(home: string, port: number): string[] {
  return ['--home', home, '--port', String(port), '--yes', '--no-open', '--preset', path.join(home, 'preview-preset.json')];
}

async function stopPreview(handle: PreviewHandle, home: string): Promise<void> {
  handle.signal('SIGTERM');
  expect(await handle.exit).toEqual({ code: 0, signal: null });
  expect(existsSync(home)).toBe(false);
}

describe('kvman-preview runs a preview (09 §9.3, ADR 0010, 7, 21)', () => {
  it('QA17-H13 starts the fake with the exact arguments and prints one JSON URL line', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const home = previewHomePath('h13-args');
    const handle = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'h13-args', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    const line = await handle.line;
    const port = previewPortOf((JSON.parse(line) as { url: string }).url);
    const logged = readFakeLog(fake.log);
    expect(logged.args).toEqual(expectedArgs(home, port));
    expect(logged.cwd).toBe(sandbox.root);
    expect(handle.stdoutText()).toBe(`${line}\n`);
    expect(handle.stderrText()).toBe('');
    await stopPreview(handle, home);
  });

  it('QA17-H13 generates a preset of kvai, kvwebui, and the project as path:', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const home = previewHomePath('h13-preset');
    const handle = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'h13-preset', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    await handle.line;
    const preset = JSON.parse(readFileSync(path.join(home, 'preview-preset.json'), 'utf8')) as unknown;
    expect(preset).toEqual({
      name: 'preview',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', [made.packageName]: `path:${made.folder}` },
      settings: { 'kvwebui.home': 'kvwebui.extensions' },
    });
    await stopPreview(handle, home);
  });

  it('QA17-H13 builds on a given preset, making its relative path: entries absolute', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const other = path.join(sandbox.root, 'other');
    mkdirSync(other, { recursive: true });
    const given = path.join(sandbox.root, 'given.json');
    writeFileSync(given, JSON.stringify({ name: 'given', extensions: { '@kvman/kvai': 'bundled', '@me/other': 'path:./other' }, settings: { 'kernel.workers': 1 } }));
    const home = previewHomePath('h13-given');
    const handle = sandbox.start([made.folder, '--preset', given, '--kvman', fake.entry, '--name', 'h13-given', '--json'], {
      cwd: sandbox.folder('work'),
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    await handle.line;
    const preset = JSON.parse(readFileSync(path.join(home, 'preview-preset.json'), 'utf8')) as unknown;
    expect(preset).toEqual({
      name: 'given',
      extensions: { '@kvman/kvai': 'bundled', '@me/other': `path:${other}`, [made.packageName]: `path:${made.folder}` },
      settings: { 'kernel.workers': 1 },
    });
    await stopPreview(handle, home);
  });

  it('QA17-H13 runs web:build once and web:watch, and SIGTERM stops the preview and the watcher', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo', { scripts: webScripts });
    const home = previewHomePath('h13-term');
    const handle = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'h13-term', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    await handle.line;
    await waitForFile(path.join(made.folder, 'built.txt'), 30_000);
    const watcher = Number(readFileSync(path.join(made.folder, 'watch.pid'), 'utf8'));
    expect(pidAlive(watcher)).toBe(true);
    handle.signal('SIGTERM');
    expect(await handle.exit).toEqual({ code: 0, signal: null });
    expect(readFakeLog(fake.log).signals).toContain('SIGINT');
    expect(pidAlive(watcher)).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  it('QA17-H13 SIGINT stops the preview and the watcher the same way', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo', { scripts: webScripts });
    const home = previewHomePath('h13-int');
    const handle = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'h13-int', '--json'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    await handle.line;
    await waitForFile(path.join(made.folder, 'watch.pid'), 30_000);
    const watcher = Number(readFileSync(path.join(made.folder, 'watch.pid'), 'utf8'));
    handle.signal('SIGINT');
    expect(await handle.exit).toEqual({ code: 0, signal: null });
    expect(readFakeLog(fake.log).signals).toContain('SIGINT');
    expect(pidAlive(watcher)).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  it('QA17-H13 without --json prints the human running line', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const home = previewHomePath('h13-human');
    const handle = sandbox.start([made.folder, '--kvman', fake.entry, '--name', 'h13-human'], {
      cwd: sandbox.root,
      env: { FAKE_KVMAN_LOG: fake.log },
    });
    const line = await handle.line;
    expect(line.startsWith('Preview running at http://127.0.0.1:')).toBe(true);
    const port = previewPortOf(line.replace('Preview running at ', ''));
    expect(handle.stdoutText()).toBe(`Preview running at http://127.0.0.1:${String(port)}/\n`);
    await stopPreview(handle, home);
  });

  it('QA17-H13 with no --kvman runs the kvman found on the PATH', async () => {
    const sandbox = makeSandbox();
    const fake = sandbox.fake('fake');
    const made = sandbox.project('demo');
    const shim = sandbox.pathShim('shim', fake.entry);
    const home = previewHomePath('h13-path');
    const handle = sandbox.start([made.folder, '--name', 'h13-path', '--json'], {
      cwd: sandbox.root,
      env: { ...shim.env, FAKE_KVMAN_LOG: fake.log },
    });
    const line = await handle.line;
    const port = previewPortOf((JSON.parse(line) as { url: string }).url);
    expect(readFakeLog(fake.log).args).toEqual(expectedArgs(home, port));
    await stopPreview(handle, home);
  });
});
