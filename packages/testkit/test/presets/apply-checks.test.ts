import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { applyPreviewSchema, jsonSchema } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, extensionActor, installed, person, problemOf, stagingTrees, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { emptyPreset } from '../install/fixture-presets.ts';
import { admission, rows, valueOf } from '../workspaces/harness.ts';
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

// A failed stage leaves no token behind: no staging tree and no version row for the entries it fetched.
function expectClean(names: readonly string[]): void {
  expect(stagingTrees(openFixture())).toEqual([]);
  for (const name of names) expect(versionRows(openFixture(), name)).toEqual([]);
}

describe('preset apply stage checks (plan 07 §7.4, ADR 0148)', presetTests, () => {
  it('M2.8-E25 a shared namespace, a missing type, refused grants, and bad config fail the stage', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const pdf = await integrityOf('@acme/pdf', '1.0.0');
    const clash = await integrityOf('@acme/clash', '1.0.0');
    const reader = await integrityOf('@acme/reader', '1.0.0');
    await installed(current, 'npm:@acme/pdf@1.0.0');
    const clashGrants = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };
    const clashEntry = { source: 'npm:@acme/clash@1.0.0', integrity: clash, enabled: true, grants: clashGrants };

    const shared = jsonSchema.parse({ ...presetP(pdf), extensions: { ...presetP(pdf).extensions, '@acme/clash': clashEntry } });
    expect(problemOf(await stageApply(current, workspaceA, { json: shared })))
      .toMatchObject({ code: 'NAMESPACE_CONFLICT', detail: expect.stringContaining('@acme/clash') });
    expectClean(['@acme/clash']);

    const readerGrants = {
      isolation: 'sandboxed', requested: [{ name: 'calls', types: ['pdf.files.list'] }], derived: { subscribes: [], providesLlm: [] },
    };
    const readerEntry = { source: 'npm:@acme/reader@1.0.0', integrity: reader, enabled: true, grants: readerGrants };
    const lonely = jsonSchema.parse({ ...presetP(pdf, { extensions: {} }), extensions: { '@acme/reader': readerEntry } });
    expect(problemOf(await stageApply(current, workspaceA, { json: lonely }))).toMatchObject({
      code: 'EXT_REQUIRES_MISSING', params: { types: ['pdf.files.list'] }, issues: [{ path: 'extensions.@acme/reader' }],
    });
    expectClean(['@acme/reader']);

    const denied = jsonSchema.parse(presetP(pdf, {
      extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@1.0.0', integrity: pdf, enabled: true, grants: pdfGrants('0.9.0') } },
    }));
    expect(problemOf(await stageApply(current, workspaceA, { json: denied }))).toMatchObject({
      code: 'CAPABILITY_DENIED', params: { name: '@acme/pdf', missing: ['files.read'], unexpected: [] },
      issues: [{ path: 'extensions.@acme/pdf.grants' }],
    });
    expect(stagingTrees(openFixture())).toEqual([]);
    expect(versionRows(openFixture(), '@acme/pdf')).toHaveLength(1);

    const config = jsonSchema.parse(presetP(pdf, { config: { '@acme/pdf': { limit: 50 } } }));
    expect(problemOf(await stageApply(current, workspaceA, { json: config }))).toMatchObject({
      code: 'CONFIG_INVALID', issues: [{ path: 'config.@acme/pdf.limit' }],
    });
    expect(stagingTrees(openFixture())).toEqual([]);
    expect(versionRows(openFixture(), '@acme/pdf')).toHaveLength(1);
  });

  it('M2.8-E26 a rollback the stored data does not allow fails the stage', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    valueOf(await command(current, 'kernel.extension.enable', { workspaceId: workspaceB, name: '@acme/pdf', grants: pdfGrants('1.0.0') }));
    expect(rows(current, 'SELECT version FROM schema_versions WHERE owner = ?', '@acme/pdf')).toMatchObject([{ version: 2 }]);
    const old = await integrityOf('@acme/pdf', '0.9.0');
    const rollback = jsonSchema.parse(presetP(old, {
      extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@0.9.0', integrity: old, enabled: true, grants: pdfGrants('0.9.0') } },
    }));
    expect(problemOf(await stageApply(current, workspaceA, { json: rollback })))
      .toMatchObject({ code: 'EXT_ROLLBACK_BLOCKED', params: { stored: 2, target: 1 } });
    expect(stagingTrees(current)).toEqual([]);
  });

  it('M2.8-E27 unknown presets, workspaces, built-in ids, and secrets fail the stage', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    expect(problemOf(await stageApply(current, workspaceA, { presetId: 'nope' }))).toMatchObject({ code: 'NOT_FOUND' });
    expect(problemOf(await stageApply(current, 'c'.repeat(64), { presetId: 'pdf-app' }))).toMatchObject({ code: 'WORKSPACE_INVALID' });

    writeCatalogPreset(current.connection, presetP(integrity, { id: 'alpha', name: 'Alpha' }), true, current.timers.time.value);
    const builtin = jsonSchema.parse(presetP(integrity, { id: 'alpha', name: 'Alpha' }));
    expect(problemOf(await stageApply(current, workspaceA, { json: builtin }))).toMatchObject({ code: 'PRESET_READONLY' });

    await installed(current, 'npm:@acme/pdf@1.0.0');
    const secret = jsonSchema.parse({ ...presetP(integrity), config: { '@acme/pdf': { apiKey: 'x' } } });
    expect(problemOf(await stageApply(current, workspaceA, { json: secret })))
      .toMatchObject({ code: 'PRESET_SECRET', issues: [{ path: 'config.@acme/pdf.apiKey' }] });
  });

  it('M2.8-E28 an expired, used, or changed token fails the apply and leaves no tree', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    writeAppliedPreset(current.connection, workspaceA, emptyPreset(), current.timers.time.value);
    current.runtime.registry.refresh();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);

    const expired = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    current.timers.time.value += 10 * 60_000 + 1;
    expect(problemOf(await applyPreset(current, expired.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(stagingTrees(current)).toEqual([]);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(1);

    const once = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, { presetId: 'pdf-app' })));
    expect(await applyPreset(current, once.confirmationToken)).toEqual({ ok: true, value: { revision: 2 } });
    expect(problemOf(await applyPreset(current, once.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });

    const newer = await integrityOf('@acme/pdf', '1.1.0');
    const changed = applyPreviewSchema.parse(valueOf(await stageApply(current, workspaceA, {
      json: jsonSchema.parse(presetP(newer, {
        extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@1.1.0', integrity: newer, enabled: true, grants: pdfGrants('1.1.0') } },
      })),
    })));
    const [tree] = stagingTrees(current);
    writeFileSync(join(current.home, 'extensions', 'staging', String(tree), 'tree', 'changed.txt'), 'changed');
    expect(problemOf(await applyPreset(current, changed.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(stagingTrees(current)).toEqual([]);
    expect(readAppliedPreset({ connection: current.connection }, workspaceA)?.revision).toBe(2);
  });

  it('M2.8-E29 only a person applies, only an admin stages', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    const integrity = await integrityOf('@acme/pdf', '1.0.0');
    writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
    expect(await admission(current, 'kernel.preset.apply', { confirmationToken: 'token' }, extensionActor('@acme/steward'))).toBe('CALLER_NOT_ALLOWED');
    const payload = { workspaceId: workspaceA, presetId: 'pdf-app' };
    expect(valueOf(await command(current, 'caller.call', { type: 'kernel.preset.apply.stage', payload }, person, workspaceA)))
      .toEqual({ ok: false, code: 'CAPABILITY_DENIED' });
    const preview = valueOf(await command(current, 'steward.call', { type: 'kernel.preset.apply.stage', payload }, person, workspaceA));
    expect(preview).toMatchObject({ result: { preset: { id: 'pdf-app' }, confirmationToken: expect.any(String) } });
  });
});
