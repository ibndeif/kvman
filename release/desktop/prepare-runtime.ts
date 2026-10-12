import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveOf, checkArchive, cleanDeployed, layoutOf, npmLauncher, targetOf, type Archive, type NodePins, type Target } from './runtime-plan.ts';

// `node release/desktop/prepare-runtime.ts` fills `packages/desktop/src-tauri/runtime` for the system it runs on (plan
// 14 §14.3): the pinned Node and its npm from nodejs.org, checked against the pinned checksum, and kvman deployed from
// the repository as it was built.

const root = fileURLToPath(new URL('../..', import.meta.url));
const runtime = path.join(root, 'packages', 'desktop', 'src-tauri', 'runtime');

function readPins(): NodePins {
  return JSON.parse(readFileSync(fileURLToPath(new URL('node-runtime.json', import.meta.url)), 'utf8')) as NodePins;
}

async function download(archive: Archive): Promise<Uint8Array> {
  const response = await fetch(archive.url);
  if (!response.ok) throw new Error(`${archive.url} answered ${String(response.status)}.`);
  return new Uint8Array(await response.arrayBuffer());
}

function unpack(archive: Archive, bytes: Uint8Array): string {
  const work = mkdtempSync(path.join(runtime, 'unpack-'));
  const file = path.join(work, archive.file);
  writeFileSync(file, bytes);
  // bsdtar, which Windows and macOS have as `tar`, and GNU tar both read the archive by its content.
  execFileSync('tar', ['-xf', file, '-C', work], { stdio: 'inherit' });
  return work;
}

function copyNode(target: Target, unpacked: string): void {
  const layout = layoutOf(target);
  const place = (inside: string): string => path.join(runtime, ...inside.split('/'));
  mkdirSync(place(layout.nodeFolder), { recursive: true });
  if (target.startsWith('win')) {
    for (const file of ['node.exe', 'npm.cmd']) cpSync(path.join(unpacked, file), place(`node/${file}`));
    cpSync(path.join(unpacked, 'node_modules', 'npm'), place(layout.npmPackage), { recursive: true });
  } else {
    cpSync(path.join(unpacked, 'bin', 'node'), place(layout.node));
    cpSync(path.join(unpacked, 'lib', 'node_modules', 'npm'), place(layout.npmPackage), { recursive: true });
    writeFileSync(place(layout.npm), npmLauncher);
    chmodSync(place(layout.npm), 0o755);
  }
  cpSync(path.join(unpacked, 'LICENSE'), place('node/LICENSE'));
  cleanDeployed(path.join(runtime, 'node'));
}

function deployKvman(): void {
  const folder = path.join(runtime, 'kvman');
  // The flat layout has no links between packages, which an installer wouldn't keep.
  execFileSync('pnpm', ['--filter', 'kvman', 'deploy', '--prod', '--config.node-linker=hoisted', folder], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  cleanDeployed(folder);
}

const target = targetOf(process.platform, process.arch);
const archive = archiveOf(readPins(), target);
rmSync(runtime, { recursive: true, force: true });
mkdirSync(runtime, { recursive: true });
const bytes = await download(archive);
checkArchive(archive, bytes);
const work = unpack(archive, bytes);
copyNode(target, path.join(work, archive.folder));
rmSync(work, { recursive: true, force: true });
deployKvman();
console.log(`The runtime for ${target} is in ${runtime}: Node ${archive.folder}, its npm, and kvman.`);
