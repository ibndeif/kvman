import { fileURLToPath } from 'node:url';
import type { Connection } from '@kvman/kernel';
import type { Capabilities } from '@kvman/protocol';
import { z } from '@kvman/sdk';
import { workspaceA } from '../hosts/harness.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { prepareHome } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, person, type InstallFixture } from '../install/harness.ts';
import { query, valueOf } from '../workspaces/harness.ts';
import { lingo } from './fixtures/lingo.ts';
import { lingoMute } from './fixtures/lingo-mute.ts';

export const i18nTests = { timeout: 120_000 } as const;
export const lingoName = '@acme/lingo';
export const muteName = '@acme/lingo-mute';
export const lingoGrant: Capabilities = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));
const localesSchema = z.object({
  start: z.string().optional(),
  relay: z.string().optional(),
  finish: z.string().optional(),
  tick: z.string().optional(),
});

export async function installLingoBuilds(connection: Connection, home: string): Promise<void> {
  await installFixture(connection, home, { definition: lingo, folder, entry: 'lingo.ts' });
  await installFixture(connection, home, { definition: lingoMute, folder, entry: 'lingo-mute.ts' });
}

export function prepareLingoHome(home: string): Promise<void> {
  return prepareHome(home, async (connection, folder) => {
    await installLingoBuilds(connection, folder);
    applyTestPreset(connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, { [lingoName]: lingoGrant });
  });
}

export async function openLingoFixture(options: { home?: string } = {}): Promise<InstallFixture> {
  const fixture = await openInstallFixture(options.home === undefined ? {} : { home: options.home });
  await installLingoBuilds(fixture.connection, fixture.home);
  fixture.runtime.registry.refresh();
  return fixture;
}

export async function setLocale(fixture: InstallFixture, locale: string): Promise<void> {
  valueOf(await command(fixture, 'kernel.user.preferences.set', { locale }, person));
}

export async function locales(fixture: InstallFixture, workspaceId: string): Promise<z.infer<typeof localesSchema>> {
  const answer = await query(fixture, 'lingo.locales.get', {}, person, workspaceId);
  if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('Lingo locales query failed');
  return localesSchema.parse(answer.value);
}
