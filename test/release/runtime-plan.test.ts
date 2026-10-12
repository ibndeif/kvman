import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveOf, checkArchive, cleanDeployed, layoutOf, npmLauncher, targetOf, targets, type NodePins } from '../../release/desktop/runtime-plan.ts';

const pins = JSON.parse(readFileSync(fileURLToPath(new URL('../../release/desktop/node-runtime.json', import.meta.url)), 'utf8')) as NodePins;

describe('what the desktop app holds (14 §14.3, ADR 0038, 33)', () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
  const temporary = (): string => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-runtime-plan-'));
    folders.push(folder);
    return folder;
  };

  it('M3.3-H8 a Node build whose checksum differs fails the build', () => {
    const bytes = new TextEncoder().encode('the archive');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const archive = { ...archiveOf(pins, 'linux-x64'), sha256 };
    expect(() => checkArchive(archive, bytes)).not.toThrow();
    const changed = new TextEncoder().encode('the archivf');
    const found = createHash('sha256').update(changed).digest('hex');
    expect(() => checkArchive(archive, changed)).toThrow(`${archive.file} has the checksum ${found}, not the pinned ${sha256}.`);
  });

  it("M3.3-E1 each system's Node archive is pinned, and another system is refused", () => {
    expect(pins.version).toMatch(/^24\.\d+\.\d+$/);
    const base = `https://nodejs.org/dist/v${pins.version}/node-v${pins.version}`;
    expect(targets.map((target) => archiveOf(pins, target).url)).toEqual([`${base}-linux-x64.tar.xz`, `${base}-darwin-arm64.tar.xz`, `${base}-darwin-x64.tar.xz`, `${base}-win-x64.zip`]);
    for (const target of targets) expect(archiveOf(pins, target).sha256, target).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(Object.values(pins.sha256)).size).toBe(4);
    expect(archiveOf(pins, 'win-x64').folder).toBe(`node-v${pins.version}-win-x64`);
    expect([targetOf('linux', 'x64'), targetOf('darwin', 'arm64'), targetOf('darwin', 'x64'), targetOf('win32', 'x64')]).toEqual([...targets]);
    expect(() => targetOf('linux', 'arm64')).toThrow("The desktop app isn't built for linux arm64");
    expect(() => targetOf('freebsd', 'x64')).toThrow("The desktop app isn't built for freebsd x64");
  });

  it('M3.3-E2 what the app holds, per system', () => {
    const unix = { node: 'node/bin/node', npm: 'node/bin/npm', nodeFolder: 'node/bin', npmPackage: 'node/lib/node_modules/npm', entry: 'kvman/dist/main.js' };
    for (const target of ['linux-x64', 'darwin-arm64', 'darwin-x64'] as const) expect(layoutOf(target)).toEqual(unix);
    expect(layoutOf('win-x64')).toEqual({ node: 'node/node.exe', npm: 'node/npm.cmd', nodeFolder: 'node', npmPackage: 'node/node_modules/npm', entry: 'kvman/dist/main.js' });
    for (const target of targets) {
      const layout = layoutOf(target);
      expect(path.posix.dirname(layout.node)).toBe(layout.nodeFolder);
      expect(path.posix.dirname(layout.npm)).toBe(layout.nodeFolder);
    }
  });

  it('M3.3-E3 the npm launcher runs the Node beside it with that Node\'s own npm', () => {
    expect(npmLauncher.startsWith('#!/bin/sh\n')).toBe(true);
    expect(npmLauncher).toContain('exec "$folder/node" "$folder/../lib/node_modules/npm/bin/npm-cli.js" "$@"\n');
    expect(npmLauncher).toContain('folder=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n');
    const launcher = readFileSync(fileURLToPath(new URL('../../release/desktop/prepare-runtime.ts', import.meta.url)), 'utf8');
    expect(launcher).toContain('chmodSync(place(layout.npm), 0o755);');
  });

  it('M3.3-E4 the runtime holds no link and no development leftovers', () => {
    const deployed = temporary();
    mkdirSync(path.join(deployed, 'dist'));
    mkdirSync(path.join(deployed, 'node_modules', '.bin'), { recursive: true });
    mkdirSync(path.join(deployed, 'node_modules', 'zod'));
    for (const file of ['dist/main.js', 'node_modules/zod/index.js', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) writeFileSync(path.join(deployed, file), file);
    symlinkSync(path.join(deployed, 'node_modules', 'zod', 'index.js'), path.join(deployed, 'node_modules', '.bin', 'zod'));
    cleanDeployed(deployed);
    for (const gone of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'node_modules/.bin']) expect(existsSync(path.join(deployed, gone)), gone).toBe(false);
    for (const kept of ['dist/main.js', 'node_modules/zod/index.js']) expect(existsSync(path.join(deployed, kept)), kept).toBe(true);
    symlinkSync(path.join(deployed, 'dist', 'main.js'), path.join(deployed, 'node_modules', 'zod', 'link.js'));
    expect(() => cleanDeployed(deployed)).toThrow('The runtime may hold no symbolic link');
  });
});
