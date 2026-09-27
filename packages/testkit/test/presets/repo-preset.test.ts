import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readAppliedPreset } from '@kvman/kernel';
import { applyPreviewSchema, jsonSchema, trustPreviewResultSchema } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fileTests, openFilesFixture, trust, writeIn, type FilesFixture } from '../files/harness.ts';
import { command, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { openFolderAsWorkspace, query, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import { applyPreset, catalogEvents, integrityOf, openPresetFixture, presetP, presetTests, stageApply, startPresetRegistry } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function openFixture(): InstallFixture {
  if (fixture === undefined) throw new Error('no fixture is open');
  return fixture;
}

describe('the repo preset (plan 07 §7.4, ADR 0150)', fileTests, () => {
  it('M2.8-E42 the repo preset is read through the trust gate', async () => {
    const started = await openFilesFixture();
    fixture = started;
    const current: FilesFixture = started;
    const preset = { name: 'repo' };
    writeIn(current.root, '.kvman/preset.json', JSON.stringify(preset));

    expect(await query(current, 'kernel.workspace.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: true, value: { repoPreset: false } });
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: false, problem: { code: 'WORKSPACE_UNTRUSTED' } });

    await trust(current);
    expect(await query(current, 'kernel.workspace.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: true, value: { repoPreset: true } });
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: current.workspaceId }))
      .toEqual({ ok: true, value: { json: preset } });

    rmSync(join(current.root, '.kvman/preset.json'));
    await trust(current);
    expect(await query(current, 'kernel.workspace.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: true, value: { repoPreset: false } });
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });

    writeIn(current.root, '.kvman/preset.json', 'not json {');
    await trust(current);
    expect(await query(current, 'kernel.workspace.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: true, value: { repoPreset: true } });
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID' } });

    writeIn(current.root, '.kvman/preset.json', JSON.stringify({ name: 'repo, changed' }));
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: false, problem: { code: 'WORKSPACE_UNTRUSTED' } });
    expect(await query(current, 'kernel.workspace.get', { workspaceId: current.workspaceId }))
      .toMatchObject({ ok: true, value: { repoPreset: false, trust: null } });
  });
});

describe('the repo preset apply (plan 07 §7.4, ADR 0150)', presetTests, () => {
  let registry: LocalRegistry;

  beforeAll(async () => {
    registry = await startPresetRegistry();
  });

  afterAll(async () => {
    await registry.close();
  });

  it('M2.8-H9 a trusted folder preset stages and applies in one confirm', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const preset = presetP(integrity);
    const root = temporaryFolder('repo-preset');
    writeIn(root, '.kvman/preset.json', JSON.stringify(preset));
    const folder = await openFolderAsWorkspace(current, root);
    const answer = await query(current, 'kernel.trust.preview', { workspaceId: folder });
    if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) {
      throw new Error(`the trust preview failed: ${JSON.stringify(answer)}`);
    }
    const previewed = trustPreviewResultSchema.parse(answer.value);
    valueOf(await command(current, 'kernel.trust.grant', { confirmationToken: previewed.confirmationToken, mode: 'always' }));
    expect(await query(current, 'kernel.workspace.get', { workspaceId: folder }))
      .toMatchObject({ ok: true, value: { repoPreset: true } });
    expect(await query(current, 'kernel.workspace.preset.get', { workspaceId: folder }))
      .toEqual({ ok: true, value: { json: JSON.parse(JSON.stringify(preset)) } });
    const staged = applyPreviewSchema.parse(valueOf(await stageApply(current, folder, { json: jsonSchema.parse(preset) })));
    expect(await applyPreset(current, staged.confirmationToken)).toEqual({ ok: true, value: { revision: 1 } });
    expect(catalogEvents(current)).toEqual([{ presetId: 'pdf-app', cause: 'import' }]);
    expect(readAppliedPreset({ connection: current.connection }, folder)?.preset.extensions['@acme/pdf']).toMatchObject({ enabled: true });
  });
});
