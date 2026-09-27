import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { jsonSchema, presetImportPreviewResultSchema } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, extensionActor, installed, problemOf, stagingTrees, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { admission, eventsOf, query } from '../workspaces/harness.ts';
import { catalogEvents, integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, startPresetRegistry } from './harness.ts';

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

function tokenOf(answer: unknown): string {
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) {
    throw new Error(`the preview failed: ${JSON.stringify(answer)}`);
  }
  return presetImportPreviewResultSchema.parse(answer.value).confirmationToken;
}

function openFixture(): InstallFixture {
  if (fixture === undefined) throw new Error('no fixture is open');
  return fixture;
}

describe('preset import (plan 07 §7.4, ADRs 0147, 0149)', presetTests, () => {
  it('M2.8-H4 a secret config and a dev source are refused', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const secret = jsonSchema.parse({ ...presetP(integrity), config: { '@acme/pdf': { apiKey: 'x' } } });
    expect(await query(current, 'kernel.preset.import.preview', { json: secret }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_SECRET', issues: [{ path: 'config.@acme/pdf.apiKey' }] } });
    const dev = jsonSchema.parse({ ...presetP(integrity), extensions: { '@acme/pdf': { source: 'dev:pdf@1', enabled: true, grants: pdfGrants('1.0.0') } } });
    expect(await query(current, 'kernel.preset.import.preview', { json: dev }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_UNSHAREABLE', issues: [{ path: 'extensions.@acme/pdf.source' }] } });
    expect(eventsOf(current, 'kernel.preset.catalog.changed')).toEqual([]);
  });

  it('M2.8-E10 preview summarizes Preset P and import catalogs it', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const answer = await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(presetP(integrity)) });
    expect(answer).toMatchObject({
      ok: true,
      value: {
        summary: {
          preset: { id: 'pdf-app', name: 'PDF App', revision: 1 },
          replaces: null,
          extensions: [{ name: '@acme/pdf', source: 'npm:@acme/pdf@1.0.0', enabled: true, grants: pdfGrants('1.0.0') }],
          pages: ['preset.help'],
          config: [],
          hidden: { platform: ['settings.nav-general'], others: 1 },
        },
        issues: [],
      },
    });
    expect(await command(current, 'kernel.preset.import', { confirmationToken: tokenOf(answer) })).toEqual({ ok: true, value: { presetId: 'pdf-app' } });
    expect(catalogEvents(current)).toEqual([{ presetId: 'pdf-app', cause: 'import' }]);
    expect(stagingTrees(current)).toEqual([]);
  });

  it('M2.8-E11 invalid and unshareable presets fail with their codes', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const base = presetP(integrity);
    const entry = base.extensions['@acme/pdf'];
    if (entry === undefined) throw new Error('Preset P has no Pdf entry');
    const preview = (json: unknown) => query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(json) });
    expect(await preview({ ...base, presetVersion: 2 }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID', issues: [{ message: expect.stringContaining('requires a newer kvman') }] } });
    const noIntegrity = { ...entry };
    delete noIntegrity.integrity;
    expect(await preview({ ...base, extensions: { '@acme/pdf': noIntegrity } })).toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID' } });
    expect(await preview({ ...base, trust: {} })).toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID' } });
    expect(await preview({ ...base, extensions: { '@acme/pdf': { ...entry, source: 'npm:@acme/pdf@^1.0.0' } } }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_UNSHAREABLE', issues: [{ path: 'extensions.@acme/pdf.source' }] } });
    expect(await preview({ ...base, extensions: { '@acme/pdf': { ...entry, digest: 'a'.repeat(64) } } }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_UNSHAREABLE', issues: [{ path: 'extensions.@acme/pdf.digest' }] } });
    const local = { source: `local:${'a'.repeat(64)}`, enabled: true, grants: pdfGrants('1.0.0') };
    expect(await preview({ ...base, extensions: { '@acme/pdf': local } }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_UNSHAREABLE', issues: [{ path: 'extensions.@acme/pdf.source' }] } });
    expect(await preview({ ...base, presetVersion: 2, extensions: { '@acme/pdf': { ...entry, source: 'npm:@acme/pdf@^1.0.0' } } }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID', issues: [{}, {}] } });
  });

  it('M2.8-E12 an unknown config schema is a secret that cannot be ruled out', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const preset = jsonSchema.parse({ ...presetP(integrity), config: { '@acme/unknown': {} } });
    expect(await query(current, 'kernel.preset.import.preview', { json: preset }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_SECRET', issues: [{ path: 'config.@acme/unknown' }] } });
  });

  it('M2.8-E13 importing over an id replaces the catalog row only', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const old = presetP(integrity, { name: 'Old' });
    writeCatalogPreset(current.connection, old, false, current.timers.time.value);
    writeAppliedPreset(current.connection, workspaceA, old, current.timers.time.value);
    const answer = await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(presetP(integrity)) });
    expect(answer).toMatchObject({ ok: true, value: { summary: { replaces: { id: 'pdf-app', name: 'Old' } } } });
    expect(await command(current, 'kernel.preset.import', { confirmationToken: tokenOf(answer) })).toEqual({ ok: true, value: { presetId: 'pdf-app' } });
    expect(await query(current, 'kernel.preset.get', { presetId: 'pdf-app' })).toMatchObject({ ok: true, value: { name: 'PDF App' } });
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.preset.name).toBe('Old');
  });

  it('M2.8-E14 a built-in id is readonly at preview and at import', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const alpha = presetP(integrity, { id: 'alpha', name: 'Alpha' });
    writeCatalogPreset(current.connection, alpha, true, current.timers.time.value);
    expect(await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(alpha) }))
      .toMatchObject({ ok: false, problem: { code: 'PRESET_READONLY' } });
    current.connection.prepare('DELETE FROM presets WHERE id = ?').run('alpha');
    const answer = await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(presetP(integrity, { id: 'alpha', name: 'Alpha' })) });
    expect(answer).toMatchObject({ ok: true });
    writeCatalogPreset(current.connection, alpha, true, current.timers.time.value);
    expect(problemOf(await command(current, 'kernel.preset.import', { confirmationToken: tokenOf(answer) })).code).toBe('PRESET_READONLY');
  });

  it('M2.8-E15 a changed, expired, or restarted token is expired', async () => {
    fixture = await openPresetFixture(registry);
    const first = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const token = tokenOf(await query(first, 'kernel.preset.import.preview', { json: jsonSchema.parse(presetP(integrity)) }));
    const changed = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(problemOf(await command(first, 'kernel.preset.import', { confirmationToken: changed })).code).toBe('CONFIRMATION_EXPIRED');
    first.timers.time.value += 10 * 60_000 + 1;
    expect(problemOf(await command(first, 'kernel.preset.import', { confirmationToken: token })).code).toBe('CONFIRMATION_EXPIRED');
    const home = first.home;
    await first.close();
    fixture = await openPresetFixture(registry, { home });
    const second = openFixture();
    expect(problemOf(await command(second, 'kernel.preset.import', { confirmationToken: token })).code).toBe('CONFIRMATION_EXPIRED');
    expect(await query(second, 'kernel.preset.get', { presetId: 'pdf-app' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
  });

  it('M2.8-E16 an extension may not confirm an import', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    const token = tokenOf(await query(current, 'kernel.preset.import.preview', { json: jsonSchema.parse(presetP(integrity)) }));
    expect(await admission(current, 'kernel.preset.import', { confirmationToken: token }, extensionActor('@acme/steward'))).toBe('CALLER_NOT_ALLOWED');
  });
});
