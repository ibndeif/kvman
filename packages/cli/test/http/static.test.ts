import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { api } from '../support/api.ts';
import { runKvman, startKvman } from '../support/kvman-child.ts';
import { linkOutOfWeb, useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

describe('web folders (04 §4.1, 02 §2.9, ADR 0009, 41)', { timeout: 60_000 }, () => {
  it('M1.7-H6 an encoded path out of a web folder, and a symbolic link out of it, get 404 (%2e%2e is resolved as .., an app route)', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    linkOutOfWeb(world);
    const kvman = await startKvman(world, ['--preset', preset]);
    const host = { host: `127.0.0.1:${String(kvman.port)}` };
    expect((await api(kvman.port).raw('/web/app/nested/page.js', host)).status).toBe(200);
    for (const route of ['/web/app/..%2f..%2fsecret.txt', '/web/app/link.txt']) {
      const response = await api(kvman.port).raw(route, host);
      expect(response.status, route).toBe(404);
      expect(response.body, route).not.toContain('outside');
    }
    const normalized = await api(kvman.port).raw('/web/app/%2e%2e/%2e%2e/secret.txt', host);
    expect(normalized.body).toBe('<!doctype html><title>app</title>');
  });

  it("M1.7-E18 an app route is answered with the home extension's index.html", async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    const response = await calls.fetch('/some/page');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<!doctype html><title>app</title>');
  });

  it('M1.7-E19 a web home that is missing, or has no kvman.web, fails the start with EXTENSION_INVALID', async () => {
    const world = sandbox();
    const missing = await runKvman(world, ['--preset', world.appPreset({ 'kernel.web.home': 'nothing' })]);
    expect(missing.code).toBe(1);
    expect(missing.errors).toContain('EXTENSION_INVALID: The web home "nothing" (kernel.web.home) is no extension of this run that declares kvman.web.');
    world.writeExtension({ name: '@test/plain', namespace: 'plain', entry: 'export default () => undefined;' });
    const plain = world.writePreset('plain.json', { name: 'plain', extensions: { '@test/plain': 'path:./plain' }, settings: { 'kernel.web.home': 'plain', 'kernel.workers': 1 } });
    const noWeb = await runKvman(world, ['--preset', plain]);
    expect(noWeb.code).toBe(1);
    expect(noWeb.errors).toContain('EXTENSION_INVALID: The web home "plain" (kernel.web.home)');
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });
});
