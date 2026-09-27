import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { applyPreviewSchema, jsonSchema, type Preset } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, installed, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { emptyPreset } from '../install/fixture-presets.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { eventsOf, grantsOf, valueOf } from '../workspaces/harness.ts';
import { applyPreset, integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, stageApply, startPresetRegistry, updatePreset } from './harness.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startPresetRegistry();
});

afterAll(async () => {
  await registry.close();
});

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function openFixture(): InstallFixture {
  if (fixture === undefined) throw new Error('no fixture is open');
  return fixture;
}

// Preset P as A's applied copy with Pdf installed, at the preset's own revision.
async function appliedPresetP(current: InstallFixture, preset: Preset): Promise<void> {
  await installed(current, 'npm:@acme/pdf@1.0.0');
  writeAppliedPreset(current.connection, workspaceA, preset, current.timers.time.value);
  current.runtime.registry.refresh();
}

describe('preset update (plan 07 §7.4, ADR 0149)', presetTests, () => {
  it('M2.8-H3 a stale revision fails the update and keeps the copy', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(await updatePreset(current, workspaceA, { hidden: ['pdf.debug'] }, 2)).toEqual({ ok: true, value: { revision: 3 } });
    expect(await updatePreset(current, workspaceA, { hidden: ['settings.nav-general'] }, 3)).toEqual({ ok: true, value: { revision: 4 } });
    expect(problemOf(await updatePreset(current, workspaceA, { hidden: [] }, 3)))
      .toMatchObject({ code: 'PRESET_STALE', params: { revision: 4 } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(4);
  });

  it('M2.8-H8 a patch that adds an entry fails without changing the copy', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await appliedPresetP(current, presetP(await integrityOf('@acme/pdf', '1.0.0')));
    expect(problemOf(await updatePreset(current, workspaceA, { extensions: { '@acme/reader': { enabled: true } } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'extensions.@acme/reader' }] });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(1);
  });

  it('M2.8-E36 a patch edits layout, hidden, labels, and pages, and null removes a key', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await appliedPresetP(current, presetP(await integrityOf('@acme/pdf', '1.0.0'), { revision: 2 }));
    const startPage = { name: 'start', description: 'Start here.', route: '/start', title: 'Start', view: { type: 'markdown', source: 'Go.' } };
    expect(await updatePreset(current, workspaceA, {
      hidden: ['pdf.debug'],
      labels: { 'pdf.nav': 'Files' },
      pages: [startPage],
      layout: { sidebar: 'collapsed' },
    }, 2)).toEqual({ ok: true, value: { revision: 3 } });
    const edited = readAppliedPreset({ connection: current.connection }, workspaceA);
    expect(edited?.revision).toBe(3);
    expect(edited?.preset.hidden).toEqual(['pdf.debug']);
    expect(edited?.preset.pages?.map((page) => page.name)).toEqual(['start']);
    expect(edited?.preset.labels).toEqual({ 'pdf.nav': 'Files' });
    expect(edited?.preset.layout).toEqual({ sidebar: 'collapsed' });
    expect(await updatePreset(current, workspaceA, { labels: null }, 3)).toEqual({ ok: true, value: { revision: 4 } });
    const removed = readAppliedPreset({ connection: current.connection }, workspaceA);
    expect(removed?.revision).toBe(4);
    expect(removed?.preset.labels).toBeUndefined();
    expect(eventsOf(current, 'kernel.preset.changed')).toEqual([
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, revision: 3, cause: 'update' } },
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, revision: 4, cause: 'update' } },
    ]);
  });

  it('M2.8-E37 patches outside the patchable keys fail without changing the copy', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await appliedPresetP(current, presetP(await integrityOf('@acme/pdf', '1.0.0')));
    expect(problemOf(await updatePreset(current, workspaceA, { config: { '@acme/pdf': { lang: 'ar' } } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'config', message: 'config is changed with kernel.config.set' }] });
    expect(problemOf(await updatePreset(current, workspaceA, { name: 'Renamed' }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'name' }] });
    expect(problemOf(await updatePreset(current, workspaceA, { llm: { defaults: {} } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'llm' }] });
    expect(problemOf(await updatePreset(current, workspaceA, { app: { theme: { accent: 'red' } } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'app.theme.accent' }] });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(1);
  });

  it('M2.8-E38 patches that change source, remove an entry, or weaken grants fail', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await appliedPresetP(current, presetP(await integrityOf('@acme/pdf', '1.0.0')));
    expect(problemOf(await updatePreset(current, workspaceA, { extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@0.9.0' } } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'extensions.@acme/pdf.source' }] });
    expect(problemOf(await updatePreset(current, workspaceA, { extensions: { '@acme/pdf': null } }, 1)))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [{ path: 'extensions.@acme/pdf' }] });
    expect(problemOf(await updatePreset(current, workspaceA, {
      extensions: { '@acme/pdf': { grants: { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } } } },
    }, 1))).toMatchObject({ code: 'CAPABILITY_DENIED', params: { missing: ['files.read'] } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(1);
  });

  it('M2.8-E39 only a person sends extensions patches, only an admin sends any', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await appliedPresetP(current, presetP(await integrityOf('@acme/pdf', '1.0.0')));
    current.enable(workspaceA, '@acme/steward', grantsOf(current, '@acme/steward'));
    current.enable(workspaceA, '@acme/caller', grantsOf(current, '@acme/caller'));
    current.runtime.registry.refresh();
    const extensionsPatch = { extensions: { '@acme/pdf': { enabled: true } } };
    expect(valueOf(await command(current, 'steward.call', {
      type: 'kernel.preset.update', payload: { workspaceId: workspaceA, patch: extensionsPatch, revision: 3 },
    }, person, workspaceA))).toEqual({ code: 'CALLER_NOT_ALLOWED' });
    expect(valueOf(await command(current, 'steward.call', {
      type: 'kernel.preset.update', payload: { workspaceId: workspaceA, patch: { hidden: ['pdf.debug'] }, revision: 3 },
    }, person, workspaceA))).toEqual({ result: { revision: 4 } });
    expect(valueOf(await command(current, 'caller.call', {
      type: 'kernel.preset.update', payload: { workspaceId: workspaceA, patch: { hidden: [] }, revision: 4 },
    }, person, workspaceA))).toEqual({ ok: false, code: 'CAPABILITY_DENIED' });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(4);
  });

  it('M2.8-E40 turning off a required extension or enabling a namespace clash fails', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    await installed(current, 'npm:@acme/reader@1.0.0');
    await installed(current, 'npm:@acme/clash@1.0.0');
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const pdfIntegrity = await integrityOf('@acme/pdf', '1.0.0');
    const readerIntegrity = await integrityOf('@acme/reader', '1.0.0');
    const clashIntegrity = await integrityOf('@acme/clash', '1.0.0');
    const json = jsonSchema.parse(presetP(pdfIntegrity, {
      extensions: {
        '@acme/pdf': { source: 'npm:@acme/pdf@1.0.0', integrity: pdfIntegrity, enabled: true, grants: pdfGrants('1.0.0') },
        '@acme/reader': { source: 'npm:@acme/reader@1.0.0', integrity: readerIntegrity, enabled: true, grants: grantsOf(current, '@acme/reader') },
        '@acme/clash': { source: 'npm:@acme/clash@1.0.0', integrity: clashIntegrity, enabled: false, grants: grantsOf(current, '@acme/clash') },
      },
    }));
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { json })));
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(problemOf(await updatePreset(current, workspaceA, { extensions: { '@acme/pdf': { enabled: false } } }, 2)))
      .toMatchObject({ code: 'EXT_IN_USE', params: { dependents: ['@acme/reader'] } });
    expect(problemOf(await updatePreset(current, workspaceA, { extensions: { '@acme/clash': { enabled: true } } }, 2)))
      .toMatchObject({ code: 'NAMESPACE_CONFLICT' });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(2);
  });

  it('M2.8-E41 an unknown workspace or one without a preset fails the update', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    expect(problemOf(await updatePreset(current, 'f'.repeat(64), { hidden: [] }, 1))).toMatchObject({ code: 'WORKSPACE_INVALID' });
    current.connection.prepare('DELETE FROM workspace_presets WHERE workspace_id = ?').run(workspaceB);
    expect(problemOf(await updatePreset(current, workspaceB, { hidden: [] }, 1))).toMatchObject({ code: 'PRESET_REQUIRED' });
  });
});
