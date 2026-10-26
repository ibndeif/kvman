import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { askKvman, healthMilliseconds, isKvmanAlive } from '../src/health.ts';

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve));
});

async function fakeKvman(body: string): Promise<{ port: number; requests: { url: string | undefined; headers: IncomingHttpHeaders }[] }> {
  const requests: { url: string | undefined; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, headers: request.headers });
    response.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, requests };
}

describe('whether kvman answers (15 §15.5, ADR 0099, 26)', () => {
  it('M4.2-H12 a kvman that answers kernel.health.get is alive; a closed port or another program is not', async () => {
    const alive = await fakeKvman('{"ok":true,"output":{"version":"0.4.7"},"jobId":"j"}');
    expect(await isKvmanAlive(alive.port)).toBe(true);
    expect(alive.requests.map((request) => request.url)).toEqual(['/api/queries/kernel.health.get']);
    const other = await fakeKvman('<html>');
    expect(await isKvmanAlive(other.port)).toBe(false);
    const refusing = await fakeKvman('{"ok":false,"problem":{"code":"FORBIDDEN_ORIGIN","message":"x"}}');
    expect(await isKvmanAlive(refusing.port)).toBe(false);
    const closed = await fakeKvman('{}');
    await new Promise((resolve) => servers.pop()?.close(resolve));
    expect(await isKvmanAlive(closed.port)).toBe(false);
  });

  it('M4.2-H18 the call has kvman’s own Host and no Origin, and no source names secrets.json', async () => {
    const alive = await fakeKvman('{"ok":true,"output":{}}');
    await isKvmanAlive(alive.port);
    expect(alive.requests[0]?.headers.host).toBe(`127.0.0.1:${String(alive.port)}`);
    expect(alive.requests[0]?.headers.origin).toBeUndefined();
    const sources = fileURLToPath(new URL('../src/', import.meta.url));
    for (const file of readdirSync(sources)) expect(readFileSync(path.join(sources, file), 'utf8'), file).not.toContain('secrets.json');
  });

  it('M4.7-H6 a kvman that takes the call and never answers counts as gone once its time is up, 2 seconds by default', async () => {
    const server = createServer(() => undefined);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    expect(await isKvmanAlive((server.address() as AddressInfo).port, 50)).toBe(false);
    expect(healthMilliseconds).toBe(2000);
    server.closeAllConnections();
  });

  it("M4.8-H5 M4.8-E1 a running kvman's version is read from its answer; one without a version, or no answer, has none", async () => {
    const older = await fakeKvman('{"ok":true,"output":{"version":"0.4.6","preset":"coder"},"jobId":"j"}');
    expect(await askKvman(older.port)).toEqual({ answered: true, version: '0.4.6' });
    const bare = await fakeKvman('{"ok":true,"output":{}}');
    expect(await askKvman(bare.port)).toEqual({ answered: true, version: undefined });
    const other = await fakeKvman('<html>');
    expect(await askKvman(other.port)).toEqual({ answered: false });
  });
});
