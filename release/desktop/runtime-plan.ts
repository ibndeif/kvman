import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

// What the desktop app holds besides itself (plan 14 §14.3): the official Node build for its system, at one pinned
// version and checksum, that build's npm, and kvman with its production dependencies. This file decides; the program
// beside it downloads and copies.

export const targets = ['linux-x64', 'darwin-arm64', 'darwin-x64', 'win-x64'] as const;

export type Target = (typeof targets)[number];

export type NodePins = { version: string; sha256: Record<Target, string> };

export type Archive = { target: Target; file: string; url: string; sha256: string; folder: string };

export type Layout = {
  // Each path is inside the runtime folder, with `/` as its separator.
  node: string;
  npm: string;
  // The folder added to kvman's `PATH` (ADR 0038, 22).
  nodeFolder: string;
  npmPackage: string;
  entry: string;
};

const nodePlatforms: Partial<Record<NodeJS.Platform, string>> = { linux: 'linux', darwin: 'darwin', win32: 'win' };

export function targetOf(platform: NodeJS.Platform, architecture: string): Target {
  const target = `${nodePlatforms[platform] ?? platform}-${architecture}`;
  const known = targets.find((candidate) => candidate === target);
  if (known === undefined) throw new Error(`The desktop app isn't built for ${platform} ${architecture}; its systems are ${targets.join(', ')}.`);
  return known;
}

export function archiveOf(pins: NodePins, target: Target): Archive {
  const folder = `node-v${pins.version}-${target}`;
  const file = `${folder}.${target.startsWith('win') ? 'zip' : 'tar.xz'}`;
  return { target, file, folder, url: `https://nodejs.org/dist/v${pins.version}/${file}`, sha256: pins.sha256[target] };
}

// Checked before anything is unpacked, so a build never runs a Node it didn't pin.
export function checkArchive(archive: Archive, bytes: Uint8Array): void {
  const found = createHash('sha256').update(bytes).digest('hex');
  if (found !== archive.sha256) throw new Error(`${archive.file} has the checksum ${found}, not the pinned ${archive.sha256}.`);
}

export function layoutOf(target: Target): Layout {
  const entry = 'kvman/dist/main.js';
  if (target.startsWith('win')) return { node: 'node/node.exe', npm: 'node/npm.cmd', nodeFolder: 'node', npmPackage: 'node/node_modules/npm', entry };
  return { node: 'node/bin/node', npm: 'node/bin/npm', nodeFolder: 'node/bin', npmPackage: 'node/lib/node_modules/npm', entry };
}

// Node's own `bin/npm` is a symbolic link, which an installer doesn't keep, so the app brings this file in its place.
export const npmLauncher = `#!/bin/sh
folder=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$folder/node" "$folder/../lib/node_modules/npm/bin/npm-cli.js" "$@"
`;

function linksIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// A deployed kvman as the bundle takes it: without pnpm's own files and the links of `.bin`, and with no link left.
export function cleanDeployed(folder: string): void {
  for (const leftover of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', path.join('node_modules', '.bin'), path.join('node_modules', '.modules.yaml')]) {
    rmSync(path.join(folder, leftover), { recursive: true, force: true });
  }
  const links = linksIn(folder);
  if (links.length > 0) throw new Error(`The runtime may hold no symbolic link, and ${folder} has ${String(links.length)}: ${links.slice(0, 3).join(', ')}.`);
}

export function isExecutable(file: string): boolean {
  return (lstatSync(file).mode & 0o111) !== 0;
}
