import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { jsonSchema, presetCurrentGetResultSchema, presetSchema, type Preset } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, installed, problemOf, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { query, valueOf } from '../workspaces/harness.ts';
import { catalogEvents, integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, startPresetRegistry } from './harness.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';

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

function presetOf(answer: unknown): Preset {
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) {
    throw new Error(`the query failed: ${JSON.stringify(answer)}`);
  }
  return presetSchema.parse(answer.value);
}

describe('preset catalog (plan 07 §7.4, ADRs 0147, 0149)', presetTests, () => {
  it('M2.8-E17 the catalog lists by name and unknown ids are not found', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const now = current.timers.time.value;
    writeCatalogPreset(current.connection, presetSchema.parse({ ...presetP(integrity), id: 'x', name: 'b', description: 'B preset.', icon: 'languages' }), false, now);
    writeCatalogPreset(current.connection, presetSchema.parse({ ...presetP(integrity), id: 'y', name: 'A', description: 'A preset.', icon: 'languages' }), false, now);
    writeCatalogPreset(current.connection, presetSchema.parse({ ...presetP(integrity), id: 'z', name: 'a', description: 'Lower a.', icon: 'languages' }), false, now);
    expect(await query(current, 'kernel.presets.list', {})).toEqual({
      ok: true,
      value: [
        { id: 'y', name: 'A', description: 'A preset.', icon: 'languages', builtin: false, revision: 1 },
        { id: 'z', name: 'a', description: 'Lower a.', icon: 'languages', builtin: false, revision: 1 },
        { id: 'x', name: 'b', description: 'B preset.', icon: 'languages', builtin: false, revision: 1 },
      ],
    });
    expect(await query(current, 'kernel.preset.get', { presetId: 'nope' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
  });

  it('M2.8-E21 current.get returns the applied copy with its config rows', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    current.enable(workspaceA, '@acme/pdf', pdfGrants('1.0.0'));
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'ar' }, revision: 0 }));
    const answer = await query(current, 'kernel.preset.current.get', { workspaceId: workspaceA });
    expect(answer).toMatchObject({ ok: true, value: { preset: { config: { '@acme/pdf': { lang: 'ar' } } } } });
    if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) {
      throw new Error('current.get did not answer');
    }
    const parsed = presetCurrentGetResultSchema.parse(answer.value);
    expect(parsed.preset.extensions['@acme/pdf']?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(jsonSchema.parse(parsed.preset.config)).toEqual({ '@acme/pdf': { lang: 'ar' } });
  });

  it('M2.8-H10 export.get returns the workspace preset as shareable JSON', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    applyTestPreset(current.connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, { '@acme/pdf': pdfGrants('1.0.0') });
    current.runtime.registry.refresh();
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'ar' }, revision: 0 }));
    const exported = presetOf(await query(current, 'kernel.preset.export.get', { workspaceId: workspaceA }));
    expect(jsonSchema.parse(exported.config)).toEqual({ '@acme/pdf': { lang: 'ar' } });
    expect(exported.extensions['@acme/pdf']?.integrity).toBe(integrity);
    expect(exported.extensions['@acme/pdf']?.digest).toBeUndefined();
    expect(await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(exported) })).toMatchObject({ ok: true });
  });

  it('M2.8-E18 save stores the workspace preset under a derived id', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    applyTestPreset(current.connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, { '@acme/pdf': pdfGrants('1.0.0') });
    current.runtime.registry.refresh();
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'ar' }, revision: 0 }));
    writeCatalogPreset(current.connection, presetSchema.parse({ ...presetP(integrity), id: 'pdf-translator', name: 'Translator' }), false, current.timers.time.value);
    expect(await command(current, 'kernel.preset.save', { workspaceId: workspaceA, name: 'PDF Translator', description: 'Mine' }))
      .toEqual({ ok: true, value: { presetId: 'pdf-translator-2' } });
    const saved = presetOf(await query(current, 'kernel.preset.get', { presetId: 'pdf-translator-2' }));
    expect(saved.name).toBe('PDF Translator');
    expect(saved.description).toBe('Mine');
    expect(saved.revision).toBe(1);
    expect(jsonSchema.parse(saved.config)).toEqual({ '@acme/pdf': { lang: 'ar' } });
    expect(saved.extensions['@acme/pdf']?.integrity).toBe(integrity);
    expect(saved.extensions['@acme/pdf']?.digest).toBeUndefined();
    expect(catalogEvents(current)).toEqual([{ presetId: 'pdf-translator-2', cause: 'save' }]);
  });

  it('M2.8-E19 a dev entry is unshareable for save and export', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const dev = presetSchema.parse({
      presetVersion: 1, id: 'dev-work', name: 'Dev Work', revision: 1, app: { title: 'Dev', home: '/' },
      extensions: {
        '@acme/devtool': {
          source: 'dev:acme-devtool@1', enabled: false,
          grants: { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } },
        },
      },
    });
    writeAppliedPreset(current.connection, workspaceB, dev, current.timers.time.value);
    current.runtime.registry.refresh();
    expect(problemOf(await command(current, 'kernel.preset.save', { workspaceId: workspaceB, name: 'Dev Copy' })).code).toBe('PRESET_UNSHAREABLE');
    expect(await query(current, 'kernel.preset.export.get', { workspaceId: workspaceB }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_UNSHAREABLE' } });
  });

  it('M2.8-E20 a workspace without a preset is required for current, export, and save', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    current.connection.prepare('DELETE FROM workspace_presets WHERE workspace_id = ?').run(workspaceB);
    expect(await query(current, 'kernel.preset.current.get', { workspaceId: workspaceB }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_REQUIRED' } });
    expect(await query(current, 'kernel.preset.export.get', { workspaceId: workspaceB }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_REQUIRED' } });
    expect(problemOf(await command(current, 'kernel.preset.save', { workspaceId: workspaceB, name: 'Copy' })).code).toBe('PRESET_REQUIRED');
  });

  it('M2.8-E22 delete removes a catalog preset but never a builtin or the applied copy', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    current.enable(workspaceA, '@acme/pdf', pdfGrants('1.0.0'));
    const appliedBefore = readAppliedPreset({ connection: current.connection }, workspaceA)?.preset;
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    writeCatalogPreset(current.connection, presetP(integrity, { id: 'alpha', name: 'Alpha' }), true, current.timers.time.value);
    expect(await command(current, 'kernel.preset.delete', { presetId: 'pdf-app' })).toEqual({ ok: true, value: {} });
    expect(catalogEvents(current)).toEqual([{ presetId: 'pdf-app', cause: 'delete' }]);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset).toEqual(appliedBefore);
    expect(problemOf(await command(current, 'kernel.preset.delete', { presetId: 'alpha' })).code).toBe('PRESET_READONLY');
    expect(problemOf(await command(current, 'kernel.preset.delete', { presetId: 'nope' })).code).toBe('NOT_FOUND');
    const exported = presetOf(await query(current, 'kernel.preset.export.get', { presetId: 'alpha' }));
    expect(exported.extensions['@acme/pdf']?.integrity).toBe(integrity);
    expect(exported.extensions['@acme/pdf']?.digest).toBeUndefined();
  });
});
