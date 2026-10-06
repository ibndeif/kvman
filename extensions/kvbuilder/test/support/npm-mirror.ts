import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { packageClosure, parseManifest, readManifest, type Manifest } from './package-closure.ts';

// The in-test registry for the scaffold (plan 12 §12.1, ADR 0009, 113): an HTTP server on 127.0.0.1 serving
// packuments and tarballs of kvman's packages (packed with `pnpm pack`, which turns `workspace:*` into versions) and
// of every package the scaffold installs (tarred from copies of the monorepo's installed packages). npm finds it through its own
// `npm_config_registry`; nothing reaches the network.

const run = promisify(execFile);


export type Tarball = { manifest: Manifest; file: string; integrity: string; shasum: string };

export const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');

const kvmanPackages = ['packages/sdk', 'packages/kernel', 'packages/testkit'];

// The third-party dependencies of kvman's packages, then the scaffold's own tools.
function scaffoldRoots(): { name: string; from: string }[] {
  const kvwebui = path.join(repositoryRoot, 'extensions/kvwebui');
  const kvmanDependencies = kvmanPackages.flatMap((folder) => {
    const from = path.join(repositoryRoot, folder);
    return Object.keys(readManifest(from).dependencies ?? {})
      .filter((name) => !name.startsWith('@kvman/'))
      .map((name) => ({ name, from }));
  });
  return [
    ...kvmanDependencies,
    { name: 'typescript', from: repositoryRoot },
    { name: '@types/node', from: repositoryRoot },
    ...['vite', '@vitejs/plugin-vue', 'vue'].map((name) => ({ name, from: kvwebui })),
  ];
}

function described(file: string, manifest: Manifest): Tarball {
  const bytes = readFileSync(file);
  return { manifest, file, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, shasum: createHash('sha1').update(bytes).digest('hex') };
}

async function packKvman(folder: string, destination: string): Promise<Tarball> {
  const before = new Set(readdirSync(destination));
  await run('pnpm', ['pack', '--pack-destination', destination], { cwd: path.join(repositoryRoot, folder) });
  const file = readdirSync(destination).find((name) => !before.has(name));
  if (file === undefined) throw new Error(`pnpm pack made no tarball of ${folder}`);
  const { stdout } = await run('tar', ['-xOzf', path.join(destination, file), 'package/package.json']);
  return described(path.join(destination, file), parseManifest(stdout));
}

// Each copy is tarred from a fresh copy: pnpm hard-links identical files, which `tar` would store as links that npm
// drops, while a copy holds plain files.
async function tarInstalled(folder: string, destination: string, index: number): Promise<Tarball> {
  const manifest = readManifest(folder);
  const staging = path.join(destination, '..', 'staging', String(index));
  cpSync(folder, path.join(staging, 'package'), { recursive: true });
  const file = path.join(destination, `${manifest.name.replace('/', '__')}-${manifest.version}.tgz`);
  await run('tar', ['-czf', file, '-C', staging, 'package']);
  return described(file, manifest);
}

async function inBatches<Item, Result>(items: readonly Item[], size: number, work: (item: Item) => Promise<Result>): Promise<Result[]> {
  const results: Result[] = [];
  for (let start = 0; start < items.length; start += size) results.push(...(await Promise.all(items.slice(start, start + size).map(work))));
  return results;
}

/** Packs everything the scaffold installs into `destination`. */
export async function packMirror(destination: string): Promise<Tarball[]> {
  mkdirSync(destination, { recursive: true });
  const kvman: Tarball[] = [];
  for (const folder of kvmanPackages) kvman.push(await packKvman(folder, destination));
  const installed = await inBatches([...[...packageClosure(scaffoldRoots()).values()].entries()], 8, ([index, folder]) => tarInstalled(folder, destination, index));
  return [...kvman, ...installed];
}

function packument(name: string, tarballs: readonly Tarball[], base: string): unknown {
  const versions = tarballs.filter((tarball) => tarball.manifest.name === name);
  const entries = versions.map((tarball) => [tarball.manifest.version, { ...tarball.manifest, dist: { tarball: `${base}/-/tarballs/${path.basename(tarball.file)}`, integrity: tarball.integrity, shasum: tarball.shasum } }]);
  return { name, 'dist-tags': { latest: versions.at(-1)?.manifest.version }, versions: Object.fromEntries(entries) };
}

export async function serveMirror(tarballs: readonly Tarball[]): Promise<{ url: string; server: Server }> {
  const files = new Map(tarballs.map((tarball) => [path.basename(tarball.file), tarball.file]));
  const names = new Set(tarballs.map((tarball) => tarball.manifest.name));
  let base = '';
  const server = createServer((request, response) => {
    const route = decodeURIComponent(request.url ?? '/');
    const file = route.startsWith('/-/tarballs/') ? files.get(route.slice('/-/tarballs/'.length)) : undefined;
    if (file !== undefined) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(readFileSync(file));
      return;
    }
    const name = route.slice(1);
    if (!names.has(name)) {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Not found"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(packument(name, tarballs, base)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
  return { url: `${base}/`, server };
}
