import { kernelVersion, readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import {
  applyPreviewSchema, jsonSchema, presetImportResultSchema, presetImportPreviewResultSchema,
  type Capabilities, type Json,
} from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, problemOf, stagingTrees, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { installed } from '../install/harness.ts';
import { emptyPreset } from '../install/fixture-presets.ts';
import { query, rows, valueOf } from '../workspaces/harness.ts';
import { eventsOf } from '../workspaces/harness.ts';
import { applyPreset, integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, stageApply, startPresetRegistry, versionRows } from './harness.ts';

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

// M2.8: A with an empty applied preset, so a stage sees a first apply.
function emptyWorkspaceA(): void {
  const current = openFixture();
  writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
  current.runtime.registry.refresh();
}

// M2.8: a shareable preset JSON imported through the real preview and import commands.
async function importedPresetId(current: InstallFixture, json: Json): Promise<string> {
  const previewed = await query(current, 'kernel.preset.import.preview', { json });
  if (typeof previewed !== 'object' || previewed === null || !('ok' in previewed) || previewed.ok !== true || !('value' in previewed)) {
    throw new Error(`the import preview failed: ${JSON.stringify(previewed)}`);
  }
  const token = presetImportPreviewResultSchema.parse(previewed.value).confirmationToken;
  const imported = await command(current, 'kernel.preset.import', { confirmationToken: token });
  if (!imported.ok) throw new Error(`the import failed: ${imported.problem.code} ${imported.problem.detail ?? ''}`);
  return presetImportResultSchema.parse(imported.value).presetId;
}

function helpPage(): Json {
  return jsonSchema.parse({ name: 'help', description: 'How to use the app.', route: '/help', title: 'Help', view: { type: 'markdown', source: 'Read me.' } });
}

describe('preset apply version resolution (plan 07 §7.4, ADR 0148)', presetTests, () => {
  it('M2.8-H5 a package that does not match the preset integrity fails the stage', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const fetched = await integrityOf('@acme/pdf', '1.0.0');
    const pinned = await integrityOf('@acme/pdf', '1.1.0');
    const mismatch = jsonSchema.parse(presetP(pinned));
    expect(problemOf(await stageApply(current, workspaceA, { json: mismatch }))).toMatchObject({
      code: 'PRESET_INTEGRITY_MISMATCH',
      detail: expect.stringContaining('@acme/pdf'),
      params: { name: '@acme/pdf', expected: pinned, actual: fetched },
    });
    expect(stagingTrees(current)).toEqual([]);
    expect(versionRows(current, '@acme/pdf')).toEqual([]);
  });

  it('M2.8-H6 a builtin from an older kvman stages nothing and applies the bundled one', async () => {
    fixture = await openPresetFixture(registry);
    emptyWorkspaceA();
    const current = openFixture();
    const bundled = { isolation: 'shared', requested: [], derived: { subscribes: ['pdf.files.changed'], providesLlm: [] } };
    const json = jsonSchema.parse({
      presetVersion: 1, id: 'old-app', name: 'Old App', revision: 1,
      app: { title: 'Old App', home: '/help' },
      extensions: { '@acme/first': { source: 'builtin:@acme/first', integrity: 'builtin:0.0.1', enabled: true, grants: bundled } },
      pages: [helpPage()],
    });
    expect(await importedPresetId(current, json)).toBe('old-app');
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'old-app' })));
    expect(preview.install).toEqual([]);
    expect(preview.notes).toEqual([{
      code: 'bundled-builtin', name: '@acme/first', params: { kvmanVersion: '0.0.1', version: '1.0.0' },
    }]);
    expect(preview.enable).toEqual([{ name: '@acme/first', version: '1.0.0', grants: bundled }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    const [first] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/first'");
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)).toEqual({
      revision: 2,
      preset: expect.objectContaining({
        id: 'old-app',
        extensions: {
          '@acme/first': {
            // 07 §7.4 step 7 sets only the digest; the preset's integrity is kept as written.
            source: 'builtin:@acme/first', integrity: 'builtin:0.0.1', digest: first?.['digest'],
            enabled: true, grants: bundled,
          },
        },
      }),
    });
  });

  it('M2.8-H7 switching Pdf to 1.1.0 updates every workspace that enables it', async () => {
    fixture = await openPresetFixture(registry);
    emptyWorkspaceA();
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/pdf', grants: pdfGrants('1.0.0') }));
    const next = await integrityOf('@acme/pdf', '1.1.0');
    const json = jsonSchema.parse(presetP(next, {
      extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@1.1.0', integrity: next, enabled: true, grants: pdfGrants('1.1.0') } },
    }));
    expect(await importedPresetId(current, json)).toBe('pdf-app');
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(preview.switches).toEqual([{
      name: '@acme/pdf', from: '1.0.0', to: '1.1.0',
      workspaces: [{ workspaceId: workspaceB, name: 'B', missing: ['llm'], unexpected: [] }],
    }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    const [version] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/pdf' AND source = 'npm:@acme/pdf@1.1.0'");
    const digest = String(version?.['digest']);
    const [active] = rows(current, "SELECT active_digest FROM extensions WHERE name = '@acme/pdf'");
    expect(active?.['active_digest']).toBe(digest);
    expect(readAppliedPreset({ connection: current.connection }, workspaceB)?.preset.extensions['@acme/pdf']).toEqual({
      source: 'npm:@acme/pdf@1.1.0', integrity: next, digest, enabled: true, grants: pdfGrants('1.1.0'),
    });
    expect(eventsOf(current, 'kernel.extension.reloaded')).toEqual([
      { workspaceId: workspaceB, payload: { workspaceId: workspaceB, name: '@acme/pdf', digest } },
    ]);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset.extensions['@acme/pdf']).toMatchObject({
      source: 'npm:@acme/pdf@1.1.0', integrity: next, digest, enabled: true,
    });
  });

  it('M2.8-E31 an older builtin grant becomes the bundled one at shared isolation', async () => {
    fixture = await openPresetFixture(registry);
    emptyWorkspaceA();
    const current = openFixture();
    const bundled = { isolation: 'shared', requested: [], derived: { subscribes: ['pdf.files.changed'], providesLlm: [] } };
    const json = jsonSchema.parse({
      presetVersion: 1, id: 'old-app', name: 'Old App', revision: 1,
      app: { title: 'Old App', home: '/help' },
      extensions: {
        '@acme/first': {
          source: 'builtin:@acme/first', integrity: `builtin:${kernelVersion()}`, enabled: true,
          grants: { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } },
        },
      },
      pages: [helpPage()],
    });
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { json })));
    expect(preview.enable).toEqual([{ name: '@acme/first', version: '1.0.0', grants: bundled }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset.extensions['@acme/first'])
      .toMatchObject({ enabled: true, grants: bundled });
  });

  it('M2.8-E33 stored data migrates at apply when the preset switches the version', async () => {
    fixture = await openPresetFixture(registry);
    emptyWorkspaceA();
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@0.9.0');
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/pdf', grants: pdfGrants('0.9.0') }));
    valueOf(await command(current, 'kernel.extension.disable', { workspaceId: workspaceB, name: '@acme/pdf' }));
    expect(rows(current, 'SELECT version FROM schema_versions WHERE owner = ?', '@acme/pdf')).toEqual([{ version: 1 }]);
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(preview.switches).toEqual([{ name: '@acme/pdf', from: '0.9.0', to: '1.0.0', workspaces: [] }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(rows(current, 'SELECT version FROM schema_versions WHERE owner = ?', '@acme/pdf')).toEqual([{ version: 2 }]);
    const [version] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/pdf' AND source = 'npm:@acme/pdf@1.0.0'");
    const [active] = rows(current, "SELECT active_digest FROM extensions WHERE name = '@acme/pdf'");
    expect(active?.['active_digest']).toBe(version?.['digest']);
  });

  it('M2.8-E34 a failing migration keeps the switches and the previous copy', async () => {
    fixture = await openPresetFixture(registry);
    emptyWorkspaceA();
    const current = openFixture();
    const before = readAppliedPreset({ connection: current.connection }, workspaceA);
    await installed(current, 'npm:@acme/pdf@1.0.0');
    await installed(current, 'npm:@acme/stash@1.0.0');
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/pdf', grants: pdfGrants('1.0.0') }));
    const stashGrants: Capabilities = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/stash', grants: stashGrants }));
    valueOf(await command(current, 'kernel.extension.disable', { workspaceId: workspaceB, name: '@acme/stash' }));
    expect(rows(current, 'SELECT version FROM schema_versions WHERE owner = ?', '@acme/stash')).toEqual([{ version: 1 }]);
    const pdfNext = await integrityOf('@acme/pdf', '1.1.0');
    const stashNext = await integrityOf('@acme/stash', '2.0.0');
    writeCatalogPreset(current.connection, presetP(pdfNext, {
      extensions: {
        '@acme/pdf': { source: 'npm:@acme/pdf@1.1.0', integrity: pdfNext, enabled: true, grants: pdfGrants('1.1.0') },
        '@acme/stash': { source: 'npm:@acme/stash@2.0.0', integrity: stashNext, enabled: true, grants: stashGrants },
      },
    }), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(problemOf(await applyPreset(current, preview.confirmationToken))).toMatchObject({ code: 'MIGRATION_FAILED' });
    const [pdf] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/pdf' AND source = 'npm:@acme/pdf@1.1.0'");
    const [stash] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/stash' AND source = 'npm:@acme/stash@2.0.0'");
    const [pdfActive] = rows(current, "SELECT active_digest FROM extensions WHERE name = '@acme/pdf'");
    const [stashActive] = rows(current, "SELECT active_digest FROM extensions WHERE name = '@acme/stash'");
    expect(pdfActive?.['active_digest']).toBe(pdf?.['digest']);
    expect(stashActive?.['active_digest']).toBe(stash?.['digest']);
    expect(readAppliedPreset({ connection: current.connection }, workspaceB)?.preset.extensions['@acme/pdf']).toMatchObject({
      source: 'npm:@acme/pdf@1.1.0', integrity: pdfNext, digest: pdf?.['digest'],
    });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)).toEqual(before);
  });
});
