import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Preset } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';

// Installing a preset's `npm:` extensions into `extensions/<name>@<version>/` (plan 02 §2.9, ADR 0009, 47). npm runs in
// that folder with `--prefix .`, so its command line holds only flags and `<name>@<version>`, both checked by the preset
// schema. Peers are skipped: the kernel supplies `@kvman/sdk`.

export type NpmCommand = { command: string; args: string[] };

// Windows runs npm through `cmd.exe`, since `npm` is a `.cmd` script there, which Node won't spawn directly.
export function npmInstallCommand(platform: NodeJS.Platform, spec: string): NpmCommand {
  const args = ['install', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--prefix', '.', spec];
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', ...args] };
  return { command: 'npm', args };
}

function npmExtensions(preset: Preset): { name: string; version: string }[] {
  return Object.entries(preset.extensions).flatMap(([name, source]) => (source.startsWith('npm:') ? [{ name, version: source.slice('npm:'.length) }] : []));
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1)?.trim() ?? '';
}

function install(folder: string, name: string, version: string, platform: NodeJS.Platform): void {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const { command, args } = npmInstallCommand(platform, `${name}@${version}`);
  const result = spawnSync(command, args, { cwd: folder, encoding: 'utf8', windowsHide: true });
  if (result.error === undefined && result.status === 0) return;
  rmSync(folder, { recursive: true, force: true });
  const reason = result.error?.message ?? (lastLine(result.stderr) || `npm exited with code ${String(result.status)}`);
  throw kernelProblem('EXTENSION_INVALID', `${name}@${version} couldn't be installed with npm (${reason}).`, { extension: name, version });
}

// Installs each `npm:` version that isn't installed yet; an installed one is left as it is.
export function installMissing(preset: Preset, home: string, logger: KernelLogger, platform: NodeJS.Platform): void {
  for (const { name, version } of npmExtensions(preset)) {
    const folder = path.join(home, 'extensions', `${name}@${version}`);
    if (existsSync(path.join(folder, 'node_modules', name, 'package.json'))) continue;
    logger.info('Installing an npm extension.', { extension: name, version });
    install(folder, name, version, platform);
  }
}
