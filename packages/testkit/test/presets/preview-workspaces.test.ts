import { createHash } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readAppliedPreset, writeAppliedPreset, writeCatalogPreset } from '@kvman/kernel';
import { applyPreviewSchema, type Json, type Preset } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, installed, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { writePackage, type PackageSpec } from '../install/packages.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { eventsOf, grantsOf, query, rows, valueOf } from '../workspaces/harness.ts';
import { applyPreset, installDev, integrityOf, openPresetFixture, presetP, presetTests, stageApply, startPresetRegistry } from './harness.ts';

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

// M2.8: Steward holds kernel.admin in A, so it sends kernel commands through steward.call from A.
async function stewardCall(current: InstallFixture, type: string, payload: Json): Promise<Json> {
  return valueOf(await command(current, 'steward.call', { type, payload }, person, workspaceA));
}

function previewPath(current: InstallFixture, name: string): string {
  return realpathSync.native(join(current.home, 'previews', name));
}

function previewId(current: InstallFixture, name: string): string {
  return createHash('sha256').update(previewPath(current, name), 'utf8').digest('hex');
}

// M2.8: Preset P applied to A through the real stage and apply, at revision 2.
async function applyPresetP(current: InstallFixture): Promise<void> {
  const integrity = await integrityOf('@acme/pdf', '1.0.0');
  writeCatalogPreset(current.connection, presetP(integrity), false, current.timers.time.value);
  const staged = await stageApply(current, workspaceA, { presetId: 'pdf-app' });
  const preview = applyPreviewSchema.parse(valueOf(staged));
  valueOf(await applyPreset(current, preview.confirmationToken));
}

// M2.8: the apply replaces A's preset whole, so Steward (a local: fixture no staged preset may name) is no longer
// enabled in A. Put it back at the same revision so it holds kernel.admin there again.
function restoreSteward(current: InstallFixture): void {
  const applied = readAppliedPreset({ connection: current.connection }, workspaceA);
  if (applied === undefined) throw new Error('workspace A has no applied preset');
  const [version] = rows(current, 'SELECT v.source AS source, v.integrity AS integrity, v.digest AS digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?', '@acme/steward');
  if (version === undefined) throw new Error('@acme/steward is not installed');
  const integrity = version['integrity'];
  const entry: Preset['extensions'][string] = {
    source: String(version['source']),
    ...(typeof integrity === 'string' ? { integrity } : {}),
    digest: String(version['digest']),
    enabled: true,
    grants: grantsOf(current, '@acme/steward'),
  };
  writeAppliedPreset(current.connection, workspaceA, { ...applied.preset, extensions: { ...applied.preset.extensions, '@acme/steward': entry } }, current.timers.time.value);
  current.runtime.registry.refresh();
}

// M2.8: Dev @acme/devtool, namespace devtool, requesting nothing, with one command devtool.run.
function devtoolPackage(): PackageSpec {
  return {
    name: '@acme/devtool',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/devtool', namespace: 'devtool', title: 'Devtool', description: 'A dev tool.' }, (ext) => {
  ext.registerCommand('devtool.run', { description: 'Runs the tool.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}

// M2.8: Devproc @acme/devproc, namespace devproc, requesting process.
function devprocPackage(): PackageSpec {
  return {
    name: '@acme/devproc',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/devproc', namespace: 'devproc', title: 'Devproc', description: 'A dev tool with a process.' }, (ext) => {
  ext.requestCapability('process', { reason: 'Runs tools.' });
  ext.registerCommand('devproc.run', { description: 'Runs the tool.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}

describe('preview workspaces (plan 07 §7.1, ADR 0150)', presetTests, () => {
  it('M2.8-E43 creating a preview copies the preset and config rows at revision 1 and announces it', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await applyPresetP(current);
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'en' }, revision: 0 }));
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'en', limit: 5 }, revision: 1 }));
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/pdf', scope: 'workspace', workspaceId: workspaceA, value: { lang: 'ar', limit: 5 }, revision: 2 }));
    restoreSteward(current);
    const created = await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA });
    const workspaceId = previewId(current, 'try-1');
    expect(created).toEqual({ result: { workspaceId } });
    expect(statSync(previewPath(current, 'try-1')).mode & 0o777).toBe(0o700);
    expect(rows(current, 'SELECT id, path, name, kind FROM workspaces WHERE id = ?', workspaceId))
      .toEqual([{ id: workspaceId, path: previewPath(current, 'try-1'), name: 'try-1', kind: 'preview' }]);
    const from = readAppliedPreset({ connection: current.connection }, workspaceA);
    expect(from?.revision).toBe(4);
    expect(readAppliedPreset({ connection: current.connection }, workspaceId))
      .toEqual({ preset: { ...from?.preset, revision: 1 }, revision: 1 });
    const configs = rows(current, 'SELECT extension, value, revision FROM workspace_config WHERE workspace_id = ? ORDER BY extension', workspaceId)
      .map((row) => ({ extension: row['extension'], value: JSON.parse(String(row['value'])), revision: row['revision'] }));
    expect(configs).toEqual([{ extension: '@acme/pdf', value: { lang: 'ar', limit: 5 }, revision: 1 }]);
    const fromConfigs = rows(current, 'SELECT extension, value, revision FROM workspace_config WHERE workspace_id = ? ORDER BY extension', workspaceA)
      .map((row) => ({ extension: row['extension'], value: JSON.parse(String(row['value'])), revision: row['revision'] }));
    expect(fromConfigs).toEqual([{ extension: '@acme/pdf', value: { lang: 'ar', limit: 5 }, revision: 3 }]);
    expect(eventsOf(current, 'kernel.workspace.opened')).toContainEqual({ workspaceId: null, payload: { workspaceId } });
    expect(eventsOf(current, 'kernel.preset.changed'))
      .toContainEqual({ workspaceId, payload: { workspaceId, revision: 1, cause: 'apply' } });
    expect(await query(current, 'kernel.workspaces.list', {})).toEqual({
      ok: true,
      value: [
        { id: workspaceA, path: '/w/a', name: 'A', kind: 'normal', trusted: false, exists: false },
        { id: workspaceB, path: '/w/b', name: 'B', kind: 'normal', trusted: false, exists: false },
      ],
    });
    expect(await query(current, 'kernel.workspaces.list', { includePreview: true })).toEqual({
      ok: true,
      value: [
        { id: workspaceA, path: '/w/a', name: 'A', kind: 'normal', trusted: false, exists: false },
        { id: workspaceB, path: '/w/b', name: 'B', kind: 'normal', trusted: false, exists: false },
        { id: workspaceId, path: previewPath(current, 'try-1'), name: 'try-1', kind: 'preview', trusted: false, exists: true },
      ],
    });
  });

  it('M2.8-E44 a bad name, an existing name, a from without a preset, an unknown from, and Caller are refused', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'Try 1', from: workspaceA })).toEqual({ code: 'VALIDATION_FAILED' });
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA }))
      .toEqual({ result: { workspaceId: previewId(current, 'try-1') } });
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA }))
      .toEqual({ code: 'WORKSPACE_INVALID' });
    current.connection.prepare('DELETE FROM workspace_presets WHERE workspace_id = ?').run(workspaceB);
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'no-preset', from: workspaceB })).toEqual({ code: 'PRESET_REQUIRED' });
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'unknown-from', from: 'c'.repeat(64) })).toEqual({ code: 'WORKSPACE_INVALID' });
    expect(valueOf(await command(current, 'caller.call', { type: 'kernel.workspace.preview.create', payload: { name: 'caller-try', from: workspaceA } }, person, workspaceA)))
      .toEqual({ ok: false, code: 'CAPABILITY_DENIED' });
  });

  it('M2.8-E45 only a dev version is enabled by an admin extension in a preview, under the dev limits', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installDev(current, writePackage(devtoolPackage()), 'dev:acme-devtool@1');
    await installDev(current, writePackage(devprocPackage()), 'dev:acme-devproc@1');
    await installed(current, 'npm:@acme/pdf@1.0.0');
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA }))
      .toEqual({ result: { workspaceId: previewId(current, 'try-1') } });
    const preview = previewId(current, 'try-1');
    const dev = grantsOf(current, '@acme/devtool');
    expect(await stewardCall(current, 'kernel.extension.enable', { workspaceId: preview, name: '@acme/devtool', grants: dev }))
      .toEqual({ result: { revision: 2 } });
    expect(await stewardCall(current, 'kernel.extension.enable', { workspaceId: preview, name: '@acme/devtool', grants: { ...dev, isolation: 'dedicated' } }))
      .toEqual({ code: 'CAPABILITY_DENIED' });
    expect(await stewardCall(current, 'kernel.extension.enable', { workspaceId: preview, name: '@acme/devproc', grants: grantsOf(current, '@acme/devproc') }))
      .toEqual({ code: 'CAPABILITY_DENIED' });
    expect(problemOf(await command(current, 'kernel.extension.enable', { workspaceId: preview, name: '@acme/devproc', grants: grantsOf(current, '@acme/devproc') })))
      .toMatchObject({ code: 'CAPABILITY_DENIED', detail: 'a dev version in a preview workspace runs sandboxed and is never granted process, network, or kernel.admin' });
    expect(await stewardCall(current, 'kernel.extension.enable', { workspaceId: preview, name: '@acme/pdf', grants: grantsOf(current, '@acme/pdf') }))
      .toEqual({ code: 'CALLER_NOT_ALLOWED' });
    expect(await stewardCall(current, 'kernel.extension.enable', { workspaceId: workspaceA, name: '@acme/devtool', grants: dev }))
      .toEqual({ code: 'CALLER_NOT_ALLOWED' });
  });

  it('M2.8-E46 a preview workspace is never trusted', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA }))
      .toEqual({ result: { workspaceId: previewId(current, 'try-1') } });
    const preview = previewId(current, 'try-1');
    expect(await query(current, 'kernel.trust.preview', { workspaceId: preview }))
      .toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID', detail: 'preview workspaces are never trusted' } });
    const forged = `${Buffer.from(JSON.stringify({ workspaceId: preview, digest: '0'.repeat(64), expiresAt: Date.now() + 600_000 }), 'utf8').toString('base64url')}.forged`;
    expect(problemOf(await command(current, 'kernel.trust.grant', { confirmationToken: forged, mode: 'once' })))
      .toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(await query(current, 'kernel.workspace.get', { workspaceId: preview })).toMatchObject({ ok: true, value: { trust: null } });
  });

  it('M2.8-E47 forgetting a preview deletes its rows and its folder; forgetting A is refused', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    expect(await stewardCall(current, 'kernel.workspace.preview.create', { name: 'try-1', from: workspaceA }))
      .toEqual({ result: { workspaceId: previewId(current, 'try-1') } });
    const preview = previewId(current, 'try-1');
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/second', scope: 'workspace', workspaceId: preview, value: { note: 'hello' }, revision: 0 }));
    expect(await stewardCall(current, 'kernel.workspace.forget', { workspaceId: preview })).toEqual({ result: {} });
    expect(rows(current, 'SELECT id FROM workspaces WHERE id = ?', preview)).toEqual([]);
    expect(rows(current, 'SELECT workspace_id FROM workspace_presets WHERE workspace_id = ?', preview)).toEqual([]);
    expect(rows(current, 'SELECT workspace_id FROM workspace_config WHERE workspace_id = ?', preview)).toEqual([]);
    // The folder goes right after the forget's unit commits, and the reply is delivered at that commit (ADR 0150).
    await vi.waitFor(() => expect(existsSync(join(current.home, 'previews', 'try-1'))).toBe(false));
    expect(await stewardCall(current, 'kernel.workspace.forget', { workspaceId: workspaceA })).toEqual({ code: 'CALLER_NOT_ALLOWED' });
    expect(rows(current, 'SELECT id FROM workspaces WHERE id = ?', workspaceA)).toEqual([{ id: workspaceA }]);
    expect(rows(current, 'SELECT workspace_id FROM workspace_presets WHERE workspace_id = ?', workspaceA)).toHaveLength(1);
  });
});
