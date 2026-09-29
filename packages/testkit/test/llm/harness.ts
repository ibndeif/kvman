import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionDefinition } from '@kvman/sdk';
import { expect, vi } from 'vitest';
import { fakeProviderExtension, type FakeProviderOptions } from '../../src/fake-provider-extension.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { temporary } from '../install/packages.ts';
import asker from './fixtures/extensions/asker.ts';
import broken from './fixtures/extensions/broken.ts';
import lister from './fixtures/extensions/lister.ts';
import mute from './fixtures/extensions/mute.ts';
import slow from './fixtures/extensions/slow.ts';

// Runtimes with worker threads and a real home folder.
export const llmTests = { timeout: 120_000 } as const;

// A model refresh runs the provider's listModels in its host, whose first start loads the module; under a loaded
// machine that takes longer than vi.waitFor's 1 s default, so waits on refreshed rows get this limit.
export const refreshWait = { timeout: 15_000 } as const;

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

const fixtures: Array<{ definition: ExtensionDefinition; entry: string }> = [
  { definition: lister, entry: 'lister.ts' },
  { definition: slow, entry: 'slow.ts' },
  { definition: broken, entry: 'broken.ts' },
  { definition: asker, entry: 'asker.ts' },
  { definition: mute, entry: 'mute.ts' },
];

// Workspaces A and B, each with an empty applied preset (ADR 0124), and the LLM fixtures installed, none enabled.
export async function openLlmFixture(options: { home?: string } = {}): Promise<InstallFixture> {
  const fixture = await openInstallFixture(options.home === undefined ? {} : { home: options.home });
  for (const { definition, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  fixture.runtime.registry.refresh();
  return fixture;
}

const fakeSource = fileURLToPath(new URL('../../src/fake-provider-extension.ts', import.meta.url));

// Installs the testkit's fake provider as a fixture package and refreshes the registry (ADR 0154). Enabling it
// triggers the model refresh, which writes fake-model; wait for its row with vi.waitFor(check, refreshWait) before
// asking, and use refreshWait for every wait on work that starts a provider's host.
export async function installFakeProvider(fixture: InstallFixture, options: FakeProviderOptions = {}): Promise<void> {
  const packageFolder = temporary('fake-provider');
  writeFileSync(join(packageFolder, 'fake-provider-extension.ts'), readFileSync(fakeSource, 'utf8'));
  writeFileSync(join(packageFolder, 'entry.ts'), `import { fakeProviderExtension } from './fake-provider-extension.ts';\nexport default fakeProviderExtension(${JSON.stringify(options)});\n`);
  await installFixture(fixture.connection, fixture.home, { definition: fakeProviderExtension(options), folder: packageFolder, entry: 'entry.ts' });
  fixture.runtime.registry.refresh();
}

// Fake's model row appears once an enable's refresh runs in Fake's host; its first module load can take longer than
// vi.waitFor's 1 s default, so every wait for it gets this limit.
export async function waitForFakeModel(fixture: InstallFixture): Promise<void> {
  await vi.waitFor(() => {
    expect(fixture.connection.prepare("SELECT id FROM llm_models WHERE provider = 'fake' AND id = 'fake-model'").get()).toBeDefined();
  }, refreshWait);
}
