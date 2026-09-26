import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { tarballPackageJson } from '@kvman/kernel';
import { runServer } from 'verdaccio';
import { temporary } from './packages.ts';

export type LocalRegistry = { url: string; publish(tarball: string): Promise<void>; close(): Promise<void> };

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}/`);
    });
  });
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

// The local npm registry of every test that installs from npm (15 M2.2): Verdaccio with no uplinks, publishing
// anonymously through npm's publish request.
export async function startRegistry(): Promise<LocalRegistry> {
  const folder = temporary('registry');
  const app = await runServer({
    self_path: folder, storage: join(folder, 'storage'), uplinks: {}, auth: {}, security: { api: { legacy: true } },
    packages: { '**': { access: '$all', publish: '$all', unpublish: '$all' } }, log: { type: 'stdout', format: 'pretty', level: 'fatal' },
  });
  const server: Server = app;
  const url = await listen(server);
  return {
    url,
    publish: async (tarball) => {
      const { name, version } = await tarballPackageJson(tarball);
      if (name === undefined || version === undefined) throw new Error(`${tarball} has no name or version`);
      const bytes = readFileSync(tarball);
      const file = `${name.split('/').at(-1) ?? name}-${version}.tgz`;
      const dist = { integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, shasum: createHash('sha1').update(bytes).digest('hex'), tarball: `${url}${name}/-/${file}` };
      const body = {
        _id: name, name, 'dist-tags': { latest: version }, versions: { [version]: { name, version, dist } },
        _attachments: { [file]: { content_type: 'application/octet-stream', data: bytes.toString('base64'), length: bytes.length } },
      };
      const response = await fetch(`${url}${name.replace('/', '%2f')}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`publishing ${name}@${version} failed: ${response.status}`);
    },
    close: () => closed(server),
  };
}

// A registry serving one version of `name` with the given tarball; its metadata's integrity matches the tarball, or
// names other bytes when `integrity` is 'wrong' (M2.2-E3, E4).
export async function staticRegistry(name: string, tarball: string, integrity: 'right' | 'wrong' = 'right'): Promise<{ url: string; close(): Promise<void> }> {
  const bytes = readFileSync(tarball);
  let url = '';
  const server = createServer((request, response) => {
    if (request.url?.endsWith('.tgz') === true) {
      response.end(bytes);
      return;
    }
    const hashed = integrity === 'right' ? bytes : Buffer.from('other bytes');
    const dist = { integrity: `sha512-${createHash('sha512').update(hashed).digest('base64')}`, tarball: `${url}package.tgz` };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name, version: '1.0.0', dist }));
  });
  url = await listen(server);
  return { url, close: () => closed(server) };
}

// A registry that accepts requests and never answers them; `requests` counts what it received (M2.2-E6).
export async function silentRegistry(): Promise<{ url: string; requests: { count: number }; close(): Promise<void> }> {
  const requests = { count: 0 };
  const server = createServer(() => {
    requests.count += 1;
  });
  const url = await listen(server);
  return { url, requests, close: () => closed(server) };
}
