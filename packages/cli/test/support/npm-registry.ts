import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { z } from '@kvman/sdk';
import type { Sandbox } from './sandbox.ts';

// The in-test npm registry (plan 12 §12.1): an HTTP server on 127.0.0.1 serving package metadata and `npm pack`
// tarballs, and counting its requests. It never serves `@kvman/sdk`. kvman's npm finds it, and a temporary cache,
// through npm's own environment.

export type NpmPackage = { name: string; namespace: string; version: string };

export type Registry = { env: Record<string, string>; requests(): number; close(): Promise<void> };

const packedSchema = z.array(z.object({ filename: z.string(), integrity: z.string(), shasum: z.string() }));

type Packed = NpmPackage & { file: string; integrity: string; shasum: string };

function npmEnvironment(world: Sandbox): Record<string, string> {
  return { npm_config_cache: path.join(world.root, 'npm-cache'), npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
}

// A compiled (JavaScript) extension with a web folder, since npm extensions load `main` (plan 02 §2.9). Its query
// `<namespace>.version` answers its version.
function pack(world: Sandbox, extension: NpmPackage, tarballs: string): Packed {
  const folder = world.folder(`npm-${extension.namespace}-${extension.version}`);
  const manifest = { name: extension.name, version: extension.version, type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: extension.namespace, web: 'web' } };
  const entry = `import { z } from '@kvman/sdk';
export default (ctx) => {
  ctx.registerQuery('${extension.namespace}.version', { description: 'Its version.', public: true, input: z.object({}), output: z.string(), handle: () => '${extension.version}' });
};
`;
  mkdirSync(path.join(folder, 'web'));
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.js'), entry);
  writeFileSync(path.join(folder, 'web', 'index.html'), '<!doctype html>');
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', tarballs], { cwd: folder, encoding: 'utf8', env: { ...process.env, ...npmEnvironment(world) } });
  const [packed] = packedSchema.parse(JSON.parse(output));
  if (packed === undefined) throw new Error(`npm pack made no tarball of ${extension.name}`);
  return { ...extension, file: packed.filename, integrity: packed.integrity, shasum: packed.shasum };
}

function metadata(name: string, packages: readonly Packed[], base: string): unknown {
  const versions = packages.filter((packed) => packed.name === name);
  return {
    name,
    'dist-tags': { latest: versions.at(-1)?.version },
    versions: Object.fromEntries(
      versions.map((packed) => [
        packed.version,
        { name, version: packed.version, peerDependencies: { '@kvman/sdk': '^0.1.0' }, dist: { tarball: `${base}/tarballs/${packed.file}`, integrity: packed.integrity, shasum: packed.shasum } },
      ]),
    ),
  };
}

export async function startRegistry(world: Sandbox, packages: readonly NpmPackage[]): Promise<Registry> {
  const tarballs = world.folder('tarballs');
  const packed = packages.map((extension) => pack(world, extension, tarballs));
  let requests = 0;
  let base = '';
  const server = createServer((request, response) => {
    requests += 1;
    const route = decodeURIComponent(request.url ?? '/');
    if (route.startsWith('/tarballs/')) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(readFileSync(path.join(tarballs, path.basename(route))));
      return;
    }
    const name = route.slice(1);
    if (!packed.some((extension) => extension.name === name)) {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Not found"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(metadata(name, packed, base)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
  return {
    env: { npm_config_registry: `${base}/`, ...npmEnvironment(world) },
    requests: () => requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
