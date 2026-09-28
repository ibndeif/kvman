import { readAppliedPreset } from '@kvman/kernel';
import { uiPageAnswerSchema, uiRegistrySchema, uiTranslationsAnswerSchema, type Json, type UiRegistry } from '@kvman/protocol';
import { workspaceA } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { enable, query, valueOf } from '../workspaces/harness.ts';
import { openUiFixture, type UiBuildId, type UiFixture } from './harness.ts';

export async function boardFixture(builds: readonly UiBuildId[] = ['board']): Promise<UiFixture> {
  const fixture = await openUiFixture(builds);
  valueOf(await enable(fixture, workspaceA, '@acme/board'));
  await patch(fixture, workspaceA, { app: { home: '/board' } });
  return fixture;
}

export async function answer(fixture: UiFixture, type: string, payload: Json): Promise<unknown> {
  return query(fixture, type, payload, person);
}

export async function registry(fixture: UiFixture, workspaceId = workspaceA): Promise<UiRegistry> {
  const response = await answer(fixture, 'kernel.ui.get', { workspaceId });
  if (typeof response !== 'object' || response === null || !('value' in response)) throw new Error('registry query failed');
  return uiRegistrySchema.parse(response.value);
}

export async function page(fixture: UiFixture, pageId: string, workspaceId = workspaceA) {
  const response = await answer(fixture, 'kernel.ui.page.get', { workspaceId, pageId });
  if (typeof response !== 'object' || response === null || !('value' in response)) throw new Error('page query failed');
  return uiPageAnswerSchema.parse(response.value);
}

export async function translations(fixture: UiFixture, workspaceId = workspaceA) {
  const response = await answer(fixture, 'kernel.ui.translations.get', { workspaceId });
  if (typeof response !== 'object' || response === null || !('value' in response)) throw new Error('translations query failed');
  return uiTranslationsAnswerSchema.parse(response.value);
}

export async function patch(fixture: UiFixture, workspaceId: string, changes: Json): Promise<void> {
  const revision = readAppliedPreset({ connection: fixture.connection }, workspaceId)?.revision;
  if (revision === undefined) throw new Error('no applied preset');
  valueOf(await command(fixture, 'kernel.preset.update', { workspaceId, revision, patch: changes }, person));
}

export async function locale(fixture: UiFixture, language: string): Promise<void> {
  valueOf(await command(fixture, 'kernel.user.preferences.set', { locale: language }, person));
}
