import { kernelVersion, readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { applyPreviewSchema, jsonSchema, presetImportPreviewResultSchema, presetSchema, type Capabilities, type Preset } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, installed, person, problemOf, stagingTrees, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { emptyPreset } from '../install/fixture-presets.ts';
import { eventsOf, grantsOf, openFolderAsWorkspace, query, rows, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import { applyPreset, catalogEvents, integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, stageApply, startPresetRegistry, updatePreset, versionRows } from './harness.ts';

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

// M2.8-E23's previous copy: page preset.old, First enabled with its installed digest.
function previousCopy(firstDigest: string): Preset {
  return presetSchema.parse({
    presetVersion: 1,
    id: 'old-app',
    name: 'Old',
    revision: 1,
    app: { title: 'Old', home: '/old' },
    extensions: {
      '@acme/first': {
        source: 'builtin:@acme/first',
        integrity: `builtin:${kernelVersion()}`,
        digest: firstDigest,
        enabled: true,
        grants: { isolation: 'shared', requested: [], derived: { subscribes: ['pdf.files.changed'], providesLlm: [] } },
      },
    },
    pages: [{ name: 'old', description: 'The old page.', route: '/old', title: 'Old', view: { type: 'markdown', source: 'Old.' } }],
  });
}

describe('preset apply stage (plan 07 §7.4, ADR 0148)', presetTests, () => {
  it('M2.8-E23 staging Preset P over a copy names what apply replaces, enables, and disables', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const [first] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/first'");
    writeAppliedPreset(current.connection, workspaceA, previousCopy(String(first?.['digest'])), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    const reply = await stageApply(current, workspaceA, { presetId: 'pdf-app' });
    const preview = applyPreviewSchema.parse(valueOf(reply));
    expect(preview.preset).toEqual({ id: 'pdf-app', name: 'PDF App', revision: 1 });
    expect(preview.replaces).toEqual({ id: 'old-app', name: 'Old', revision: 1 });
    expect(preview.catalogReplaces).toBeUndefined();
    expect(preview.enable).toEqual([{ name: '@acme/pdf', version: '1.0.0', grants: pdfGrants('1.0.0') }]);
    expect(preview.disable).toEqual(['@acme/first']);
    expect(preview.pages).toEqual({ added: ['preset.help'], removed: ['preset.old'] });
    expect(preview.hidden).toEqual({ platform: ['settings.nav-general'], others: 1 });
    expect(preview.notes).toEqual([{ code: 'dependencies-differ', name: '@acme/pdf', params: {} }]);
    expect(preview.install).toMatchObject([{
      name: '@acme/pdf', source: 'npm:@acme/pdf@1.0.0', version: '1.0.0', digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      isolation: 'sandboxed', capabilities: [{ name: 'files.read', reason: 'Reads PDF files.' }], derived: { subscribes: [], providesLlm: [] },
    }]);
    expect(preview.switches).toEqual([]);
    expect(preview.config).toEqual([]);
    expect(preview.confirmationToken.length).toBeGreaterThan(0);
    expect(preview.expiresAt).toBe(current.timers.time.value + 10 * 60_000);
    expect(stagingTrees(current).length).toBe(1);
  });

  it('M2.8-H1 staging Preset P and applying installs, enables, and revisions the copy', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(preview.install).toMatchObject([{
      name: '@acme/pdf', source: 'npm:@acme/pdf@1.0.0', version: '1.0.0', digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      isolation: 'sandboxed', capabilities: [{ name: 'files.read', reason: 'Reads PDF files.' }], derived: { subscribes: [], providesLlm: [] },
    }]);
    expect(preview.enable).toEqual([{ name: '@acme/pdf', version: '1.0.0', grants: pdfGrants('1.0.0') }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    const [version] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/pdf'");
    expect(version?.['digest']).toMatch(/^[0-9a-f]{64}$/);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)).toEqual({
      revision: 2,
      preset: expect.objectContaining({
        id: 'pdf-app',
        extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@1.0.0', integrity, digest: version?.['digest'], enabled: true, grants: pdfGrants('1.0.0') } },
      }),
    });
    expect(eventsOf(current, 'kernel.extension.installed').filter((event) => event.workspaceId === null && typeof event.payload === 'object' && event.payload !== null && 'name' in event.payload && event.payload.name === '@acme/pdf'))
      .toEqual([{ workspaceId: null, payload: { name: '@acme/pdf', digest: version?.['digest'] } }]);
    expect(eventsOf(current, 'kernel.extension.enabled')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/pdf' } }]);
    expect(eventsOf(current, 'kernel.preset.changed')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, revision: 2, cause: 'apply' } }]);
  });

  it('M2.8-H2 a migration that fails at its first step fails the apply and keeps everything', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/stash@1.0.0');
    const grants = grantsOf(current, '@acme/stash');
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/stash', grants }));
    valueOf(await command(current, 'stash.put', { id: 'doc-1' }, person, workspaceB));
    valueOf(await command(current, 'kernel.extension.disable', { workspaceId: workspaceB, name: '@acme/stash' }));
    expect(await command(current, 'kernel.extension.uninstall', { name: '@acme/stash', deleteData: false })).toEqual({ ok: true, value: {} });
    const before = readAppliedPreset({ connection: current.connection }, workspaceA);
    expect(before?.revision).toBe(3);
    const integrity = await integrityOf('@acme/stash', '2.0.0');
    const json = jsonSchema.parse({
      presetVersion: 1, id: 'stash-app', name: 'Stash App', revision: 1, app: { title: 'Stash App', home: '/' },
      extensions: { '@acme/stash': { source: 'npm:@acme/stash@2.0.0', integrity, enabled: true, grants } },
      // app.home names an active page (ADR 0157).
      pages: [{ name: 'home', description: 'The stash.', route: '/', title: 'Stash', view: { type: 'stack' } }],
    });
    const previewed = await query(current, 'kernel.preset.import.preview', { json });
    if (typeof previewed !== 'object' || previewed === null || !('ok' in previewed) || previewed.ok !== true || !('value' in previewed)) {
      throw new Error(`the import preview failed: ${JSON.stringify(previewed)}`);
    }
    const token = presetImportPreviewResultSchema.parse(previewed.value).confirmationToken;
    expect(await command(current, 'kernel.preset.import', { confirmationToken: token })).toEqual({ ok: true, value: { presetId: 'stash-app' } });
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'stash-app' })));
    expect(problemOf(await applyPreset(current, preview.confirmationToken))).toMatchObject({ code: 'MIGRATION_FAILED' });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)).toEqual(before);
    expect(eventsOf(current, 'kernel.preset.changed').filter((event) => event.workspaceId === workspaceA)).toEqual([]);
    expect(rows(current, 'SELECT version FROM schema_versions WHERE owner = ?', '@acme/stash')).toEqual([{ version: 1 }]);
    expect(rows(current, "SELECT source FROM extension_versions WHERE name = '@acme/stash'")).toEqual([{ source: 'npm:@acme/stash@2.0.0' }]);
  });

  it('M2.8-E24 applying writes the preset config rows, keeps other rows, and disables First', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const [first] = rows(current, "SELECT digest FROM extension_versions WHERE name = '@acme/first'");
    writeAppliedPreset(current.connection, workspaceA, previousCopy(String(first?.['digest'])), current.timers.time.value);
    current.connection.prepare("INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, '@acme/pdf', ?, 2, ?)")
      .run(workspaceA, JSON.stringify({ lang: 'fr' }), current.timers.time.value);
    current.connection.prepare("INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, '@acme/second', ?, 1, ?)")
      .run(workspaceA, JSON.stringify({ note: 'hi' }), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity, { config: { '@acme/pdf': { lang: 'en', limit: 5 } } }), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(preview.config).toEqual([{ extension: '@acme/pdf', fields: ['lang', 'limit'] }]);
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    const [pdf] = rows(current, 'SELECT value, revision FROM workspace_config WHERE workspace_id = ? AND extension = ?', workspaceA, '@acme/pdf');
    expect(JSON.parse(String(pdf?.['value']))).toEqual({ lang: 'en', limit: 5 });
    expect(pdf?.['revision']).toBe(3);
    const [second] = rows(current, 'SELECT value, revision FROM workspace_config WHERE workspace_id = ? AND extension = ?', workspaceA, '@acme/second');
    expect(JSON.parse(String(second?.['value']))).toEqual({ note: 'hi' });
    expect(second?.['revision']).toBe(1);
    expect(eventsOf(current, 'kernel.config.changed')).toEqual([
      { workspaceId: workspaceA, payload: { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, revision: 3 } },
    ]);
    expect(eventsOf(current, 'kernel.extension.disabled')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/first' } }]);
    expect(eventsOf(current, 'kernel.preset.changed').map((event) => event.payload)).toEqual([
      { workspaceId: workspaceA, revision: 2, cause: 'apply' },
    ]);
  });

  it('M2.8-E30 staging json over a catalog id imports and applies in one step', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity, { name: 'Old' }), false, current.timers.time.value);
    const preview = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { json: jsonSchema.parse(presetP(integrity)) })));
    expect(preview.catalogReplaces).toEqual({ id: 'pdf-app', name: 'Old' });
    expect(await applyPreset(current, preview.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(catalogEvents(current)).toEqual([{ presetId: 'pdf-app', cause: 'import' }]);
    expect(await query(current, 'kernel.preset.get', { presetId: 'pdf-app' })).toMatchObject({ ok: true, value: { name: 'PDF App' } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset.extensions['@acme/pdf']).toMatchObject({ enabled: true });
  });

  it('M2.8-E35 the applied copy counts from its own revision, not the catalog one', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(5), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity, { revision: 9 }), false, current.timers.time.value);
    const first = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(await applyPreset(current, first.confirmationToken)).toEqual({ ok: true, value: { revision: 6 } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(6);
    const workspaceC = await openFolderAsWorkspace(current, temporaryFolder('workspace'));
    const second = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceC, { presetId: 'pdf-app' })));
    expect(await applyPreset(current, second.confirmationToken)).toEqual({ ok: true, value: { revision: 1 } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceC)?.revision).toBe(1);
  });

  it('M2.8-E32 applying installs a disabled entry, and a patch enables it', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const pdfIntegrity = await integrityOf('@acme/pdf', '1.0.0');
    const readerIntegrity = await integrityOf('@acme/reader', '1.0.0');
    const readerGrants: Capabilities = { isolation: 'sandboxed', requested: [{ name: 'calls', types: ['pdf.files.list'] }], derived: { subscribes: [], providesLlm: [] } };
    const json = jsonSchema.parse(presetP(pdfIntegrity, {
      extensions: {
        '@acme/pdf': { source: 'npm:@acme/pdf@1.0.0', integrity: pdfIntegrity, enabled: true, grants: pdfGrants('1.0.0') },
        '@acme/reader': { source: 'npm:@acme/reader@1.0.0', integrity: readerIntegrity, enabled: false, grants: readerGrants },
      },
    }));
    const staged = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { json })));
    expect(await applyPreset(current, staged.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(versionRows(current, '@acme/reader')).toHaveLength(1);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset.extensions['@acme/reader']?.enabled).toBe(false);
    expect(eventsOf(current, 'kernel.extension.enabled')).toEqual([
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/pdf' } },
    ]);
    expect(await updatePreset(current, workspaceA, { extensions: { '@acme/reader': { enabled: true } } }, 2))
      .toEqual({ ok: true, value: { revision: 3 } });
    expect(eventsOf(current, 'kernel.extension.enabled')).toEqual([
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/pdf' } },
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/reader' } },
    ]);
    expect(eventsOf(current, 'kernel.preset.changed').map((event) => event.payload)).toEqual([
      { workspaceId: workspaceA, revision: 2, cause: 'apply' },
      { workspaceId: workspaceA, revision: 3, cause: 'update' },
    ]);
  });
});
