import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { runKvman, startKvman, stopKvman } from '../support/kvman-child.ts';
import { startRegistry } from '../support/npm-registry.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

function helloPreset(world: Sandbox, version: string): string {
  return world.writePreset(`hello-${version}.json`, { name: 'hello', extensions: { '@acme/hello': `npm:${version}` }, settings: { 'kernel.web.home': 'hello', 'kernel.workers': 1 } });
}

// Without `--yes`, and with stdin a pipe: kvman has no terminal to ask in.
function withoutYes(world: Sandbox): string[] {
  return ['--home', world.home, '--port', '0', '--no-open'];
}

describe('trusting extensions (02 §2.9, ADR 0009, 48)', { timeout: 120_000 }, () => {
  it('M1.8-H5 an untrusted npm extension, without a terminal, is refused with EXTENSION_INVALID', async () => {
    const world = sandbox();
    const registry = await startRegistry(world, [{ name: '@acme/hello', namespace: 'hello', version: '1.0.0' }]);
    world.track(registry.close);
    const refused = await runKvman(world, [...withoutYes(world), '--preset', helloPreset(world, '1.0.0')], { defaults: false, env: registry.env });
    expect(refused.code).toBe(1);
    expect(refused.errors).toContain("EXTENSION_INVALID: These extension versions weren't accepted: @acme/hello@1.0.0 (npm:1.0.0).");
  });

  it('M1.8-H6 --yes accepts, a known version starts without asking, and a new version asks again', async () => {
    const world = sandbox();
    const registry = await startRegistry(world, [
      { name: '@acme/hello', namespace: 'hello', version: '1.0.0' },
      { name: '@acme/hello', namespace: 'hello', version: '1.1.0' },
    ]);
    world.track(registry.close);
    const accepted = await startKvman(world, ['--preset', helloPreset(world, '1.0.0')], { env: registry.env });
    expect(existsSync(path.join(world.home, 'extensions', '@acme', 'hello@1.0.0', 'node_modules', '@acme', 'hello', 'package.json'))).toBe(true);
    expect(outputOf(await api(accepted.port).query('hello.version', {}))).toBe('1.0.0');
    expect(await stopKvman(accepted)).toBe(0);
    const known = await startKvman(world, [...withoutYes(world), '--preset', helloPreset(world, '1.0.0')], { defaults: false, env: registry.env });
    expect(await stopKvman(known)).toBe(0);
    const newer = await runKvman(world, [...withoutYes(world), '--preset', helloPreset(world, '1.1.0')], { defaults: false, env: registry.env });
    expect(newer.code).toBe(1);
    expect(newer.errors).toContain("EXTENSION_INVALID: These extension versions weren't accepted: @acme/hello@1.1.0 (npm:1.1.0).");
  });
});
