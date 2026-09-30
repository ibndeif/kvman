import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { runKvman, startKvman, stopKvman } from '../support/kvman-child.ts';
import { startRegistry, type Registry } from '../support/npm-registry.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

async function helloWorld(): Promise<{ world: Sandbox; registry: Registry; preset(version: string): string }> {
  const world = sandbox();
  const registry = await startRegistry(world, [{ name: '@acme/hello', namespace: 'hello', version: '1.0.0' }]);
  world.track(registry.close);
  const preset = (version: string): string =>
    world.writePreset(`hello-${version}.json`, { name: 'hello', extensions: { '@acme/hello': `npm:${version}` }, settings: { 'kernel.web.home': 'hello', 'kernel.workers': 1 } });
  return { world, registry, preset };
}

describe('npm installs (02 §2.9, ADR 0009, 47)', { timeout: 120_000 }, () => {
  it('M1.8-E14 an installed version is not installed again', async () => {
    const { world, registry, preset } = await helloWorld();
    expect(await stopKvman(await startKvman(world, ['--preset', preset('1.0.0')], { env: registry.env }))).toBe(0);
    const before = registry.requests();
    expect(before).toBeGreaterThan(0);
    expect(await stopKvman(await startKvman(world, ['--preset', preset('1.0.0')], { env: registry.env }))).toBe(0);
    expect(registry.requests()).toBe(before);
  });

  it('M1.8-E15 a version the registry lacks fails EXTENSION_INVALID, and its folder is removed', async () => {
    const { world, registry, preset } = await helloWorld();
    const result = await runKvman(world, ['--preset', preset('9.9.9')], { env: registry.env });
    expect(result.code).toBe(1);
    expect(result.errors).toMatch(/^EXTENSION_INVALID: @acme\/hello@9\.9\.9 couldn't be installed with npm \(.+\)\.$/m);
    expect(existsSync(path.join(world.home, 'extensions', '@acme', 'hello@9.9.9'))).toBe(false);
  });

  it("M1.8-E16 an extension whose @kvman/sdk peer the registry doesn't serve installs, and loads the kernel's sdk", async () => {
    const { world, registry, preset } = await helloWorld();
    const kvman = await startKvman(world, ['--preset', preset('1.0.0')], { env: registry.env });
    expect(existsSync(path.join(world.home, 'extensions', '@acme', 'hello@1.0.0', 'node_modules', '@kvman'))).toBe(false);
    expect(outputOf(await api(kvman.port).query('hello.version', {}))).toBe('1.0.0');
  });
});
