import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection, createServer } from 'node:net';
import { betterSqlite3Driver, createUlidGenerator, EventHub, HttpAdapter, kernelVersion, openKernelDatabase, ProblemError, type LogRecord } from '@kvman/kernel';
import { healthResultSchema, kernelPorts } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { eventually, openHostFixture, workerTests } from '../hosts/harness.ts';
import { bootFixture, temporaryHome } from './harness.ts';

const ids = createUlidGenerator(Date.now);

function digest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

// A free port outside the kernel range, so no other test's kernel takes it once it is closed.
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function refusedConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

describe('boot (plan 03 §3.9, ADRs 0088, 0089)', workerTests, () => {
  it('M1.8-E7 a newer database schema refuses to start with SCHEMA_TOO_NEW', async () => {
    const home = temporaryHome();
    await (await bootFixture({ home })).close();
    const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, ids.next());
    connection.prepare("UPDATE schema_versions SET version = 99 WHERE owner = 'kernel'").run();
    connection.close();
    const before = digest(join(home, 'kvman.db'));
    const port = await freePort();
    const refused = await bootFixture({ home, port }).catch((error: unknown) => error);
    expect(refused instanceof ProblemError ? refused.problem.code : refused).toBe('SCHEMA_TOO_NEW');
    expect(existsSync(join(home, 'daemon.lock'))).toBe(false);
    expect(await refusedConnection(port)).toBe(true);
    expect(digest(join(home, 'kvman.db'))).toBe(before);
  });

  it('M1.8-E19 boot ends with kernel.started and kvman.version', async () => {
    const fixture = await bootFixture();
    const { connection, identity } = fixture.kernel;
    await eventually(() => {
      const boots = connection.prepare("SELECT value FROM kv WHERE owner = '@acme/audit' AND key = 'boots'").get();
      expect(JSON.parse(String(boots?.['value']))).toEqual([identity.instanceId]);
    });
    expect(connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE type = 'kernel.started'").get()?.['count']).toBe(0);
    expect(connection.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'kernel.started'").get()?.['count']).toBe(0);
    const setting = connection.prepare("SELECT value FROM kernel_settings WHERE key = 'kvman.version'").get();
    expect(JSON.parse(String(setting?.['value']))).toBe(kernelVersion());
    const health = healthResultSchema.parse((await send(fixture.port, 'GET', '/api/v1/health')).json);
    expect(health.version).toBe(kernelVersion());
    await fixture.close();
  });

  it('M1.8-E20 requests wait until boot finishes', async () => {
    const hosts = await openHostFixture();
    const logged: LogRecord[] = [];
    const adapter = new HttpAdapter({ ids, timers: hosts.timers, logger: { write: (record) => logged.push(record) } });
    const port = await adapter.bind(kernelPorts, ids.next());
    const answering = send(port, 'GET', '/api/v1/health');
    await eventually(() => expect(logged).toContainEqual(expect.objectContaining({ message: 'a request waits for boot', fields: { method: 'GET', route: '/api/v1/health' } })));
    const hub = new EventHub({ connection: hosts.connection, pipeline: hosts.runtime.pipeline, live: hosts.runtime.live, timers: hosts.timers, version: '0.0.0' });
    adapter.open({ runtime: hosts.runtime, hub });
    const answer = await answering;
    expect([answer.status, healthResultSchema.parse(answer.json).status]).toEqual([200, 'ok']);
    hub.close();
    await adapter.close();
    await hosts.close();
  });
});
