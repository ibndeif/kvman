import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem, ReplyPayload } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { emptyGrant } from './fixture-presets.ts';
import { command, installed, installTests, openInstallFixture, problemOf, stagingTrees, type InstallFixture } from './harness.ts';
import { extensionSource, packPackage, samplePackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;
let published = 0;

beforeAll(async () => {
  registry = await startRegistry();
});
afterAll(async () => {
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

// Publishes a package whose module is `module(name, namespace)` under a fresh name `@acme/loader-<n>` and sends its
// stage; the reply is returned unawaited, so a test can move the clock while the loader runs.
async function stageModule(current: InstallFixture, module: (name: string, namespace: string) => string): Promise<{ reply: Promise<ReplyPayload> }> {
  published += 1;
  const namespace = `loader-${published}`;
  const name = `@acme/${namespace}`;
  await registry.publish(await packPackage(writePackage({ name, files: { 'dist/extension.js': module(name, namespace) } })));
  return { reply: command(current, 'kernel.extension.stage', { source: `npm:${name}@1.0.0` }) };
}

async function stageFailure(current: InstallFixture, module: (name: string, namespace: string) => string): Promise<Problem> {
  return problemOf(await (await stageModule(current, module)).reply);
}

function setupDoing(statement: string, imports: string): (name: string, namespace: string) => string {
  return (name, namespace) => `import { defineExtension, z } from '@kvman/sdk';
${imports}
export default defineExtension({ name: '${name}', namespace: '${namespace}', title: 'Loader', description: 'A loader test.' }, (ext) => {
  ${statement}
  ext.registerCommand('${namespace}.echo', { description: 'Replies.', input: z.object({}), handle: async () => ({}) });
});
`;
}

describe('the install-time loader (plan 03 §3.5, 05 §5.1, ADR 0118)', installTests, () => {
  it('M2.2-H4 a setup that reads a file, or behaves differently on its second run, fails in the loader', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const database = JSON.stringify(join(fixture.home, 'kvman.db'));
    const reads = await stageFailure(fixture, setupDoing(`readFileSync(${database});`, "import { readFileSync } from 'node:fs';"));
    expect(reads).toMatchObject({ code: 'EXT_MANIFEST_INVALID', detail: expect.stringMatching(/^setup threw: Access to this API has been restricted/) });
    const random = await stageFailure(fixture, (name, namespace) => extensionSource(name, namespace).replace("'Replies with its input.'", '`Replies ${Math.random()}.`'));
    expect(random).toMatchObject({ code: 'EXT_MANIFEST_INVALID', issues: [expect.objectContaining({ hint: 'register the same things on every run; setup reads no clock, random numbers, or state' })] });
    expect(stagingTrees(fixture)).toEqual([]);
  });

  it('M2.2-E26 child processes, workers, file writes, and node:sqlite are denied in setup', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const attempts = [
      setupDoing("spawnSync('ls');", "import { spawnSync } from 'node:child_process';"),
      setupDoing("new Worker('export {}', { eval: true });", "import { Worker } from 'node:worker_threads';"),
      setupDoing("writeFileSync(new URL('./written.txt', import.meta.url), 'x');", "import { writeFileSync } from 'node:fs';"),
      setupDoing("process.getBuiltinModule('node:sqlite').DatabaseSync;", ''),
    ];
    for (const attempt of attempts) {
      expect(await stageFailure(fixture, attempt)).toMatchObject({ code: 'EXT_MANIFEST_INVALID', detail: expect.stringMatching(/^setup threw: /) });
    }
  });

  it('M2.2-E27 a setup that never returns, and a top-level await that never settles, are killed after 10 s', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const current = fixture;
    for (const module of [setupDoing('for (;;) {}', ''), (name: string, namespace: string) => `await new Promise(() => {});\n${extensionSource(name, namespace)}`]) {
      const { reply } = await stageModule(current, module);
      await eventually(() => expect(current.timers.pendingDelays()).toContain(10_000));
      current.timers.advance(10_000);
      expect(problemOf(await reply)).toMatchObject({ code: 'EXT_MANIFEST_INVALID', detail: 'setup did not finish within 10 s' });
    }
  });

  it("M2.2-E28 a module that throws on import, or exports no extension, is the package's fault", async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const throws = await stageFailure(fixture, () => "throw new Error('boom');\n");
    expect(throws).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the module failed to import: Error: boom' });
    const plain = await stageFailure(fixture, () => 'export default { name: 1 };\n');
    expect(plain).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the module does not export defineExtension(...) as its default' });
  });

  it('M2.2-E29 a meta.name that differs from the package, and a reserved namespace, fail validation', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const renamed = await stageFailure(fixture, (_name, namespace) => extensionSource('@acme/elsewhere', namespace));
    expect(renamed).toMatchObject({ code: 'EXT_MANIFEST_INVALID', issues: expect.arrayContaining([expect.objectContaining({ path: 'meta.name' })]) });
    const reserved = await stageFailure(fixture, (name) => extensionSource(name, 'kernel'));
    expect(reserved).toMatchObject({ code: 'EXT_MANIFEST_INVALID', issues: expect.arrayContaining([expect.objectContaining({ path: 'meta.namespace' })]) });
  });

  it("M2.2-E30 the snapshot holds no @kvman/sdk; the loader and the host use the kernel's copy", async () => {
    await registry.publish(await packPackage(writePackage(samplePackage())));
    fixture = await openInstallFixture({ registry: registry.url });
    const { digest } = await installed(fixture, 'npm:@acme/sample@1.0.0');
    fixture.enable(workspaceA, '@acme/sample', emptyGrant);
    expect(existsSync(join(fixture.home, 'extensions', 'snapshots', digest, 'node_modules', '@kvman'))).toBe(false);
    expect(await command(fixture, 'sample.echo', { text: 'sdk' }, undefined, workspaceA)).toEqual({ ok: true, value: { text: 'sdk' } });
  });
});
