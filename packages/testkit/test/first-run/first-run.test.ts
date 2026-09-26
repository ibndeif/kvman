import { mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { betterSqlite3Driver, createUlidGenerator, openKernelDatabase } from '@kvman/kernel';
import { describe, expect, it } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { closedRegistry } from '../install/fixture-snapshots.ts';
import { installTests } from '../install/harness.ts';
import { builtinNames, packedBuiltins } from './builtins.ts';

describe('first run (plan 03 §3.9, 06 §6.9, ADR 0115)', installTests, () => {
  it('M2.2-H7 first run succeeds with the network disabled', async () => {
    const builtin = await packedBuiltins();
    const home = temporaryHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const created: string[] = [];
    const watcher = watch(home, { recursive: true }, (_event, file) => {
      if (file !== null) created.push(file);
    });
    const kernel = await launchKernel({ home, fixture: 'first-run', builtin, environment: { KVMAN_NPM_REGISTRY: closedRegistry, HTTP_PROXY: closedRegistry, HTTPS_PROXY: closedRegistry } });
    try {
      expect((await send(kernel.port, 'GET', '/api/v1/health')).status).toBe(200);
      for (const name of builtinNames) {
        const answer = await command(kernel.port, `${name.slice('@acme/'.length)}.echo`, { text: name }, { wait: 10_000 });
        expect([answer.status, answer.json]).toEqual([200, { id: expect.any(String), reply: { text: name } }]);
      }
    } finally {
      await kernel.stop();
      watcher.close();
    }
    const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, createUlidGenerator(Date.now).next());
    expect(connection.prepare('SELECT name, source, integrity FROM extension_versions ORDER BY name').all()).toEqual(
      builtinNames.map((name) => ({ name, source: `builtin:${name}`, integrity: 'builtin:0.0.0' })),
    );
    expect(connection.prepare("SELECT name FROM extensions WHERE status = 'active' ORDER BY name").all()).toEqual(builtinNames.map((name) => ({ name })));
    connection.close();
    expect(created.filter((file) => /work[/\\](store|cache|home)/.test(file))).toEqual([]);
    expect(created.some((file) => file.startsWith(join('extensions', 'staging')))).toBe(true);
  });
});
