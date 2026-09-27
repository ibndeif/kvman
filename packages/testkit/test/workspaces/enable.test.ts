import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { extensionActor, problemOf, type InstallFixture } from '../install/harness.ts';
import { admission, enable, eventsOf, openFolderAsWorkspace, grantsOf, openWorkspaceFixture, presetRow, rows, run, temporaryFolder, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  return fixture;
}

describe('kernel.extension.enable (plan 06 §6.4, ADR 0123)', workspaceTests, () => {
  it('M2.3-H1 enabling two extensions with one namespace fails NAMESPACE_CONFLICT', async () => {
    const current = await opened();
    expect(await enable(current, workspaceA, '@acme/pdf-a')).toEqual({ ok: true, value: { revision: 2 } });
    const events = rows(current, 'SELECT COUNT(*) AS count FROM events')[0]?.['count'];
    const conflict = problemOf(await enable(current, workspaceA, '@acme/pdf-b'));
    expect(conflict).toMatchObject({ code: 'NAMESPACE_CONFLICT', detail: expect.stringContaining('@acme/pdf-a') });
    expect(conflict.detail).toContain('"pdf"');
    expect(presetRow(current)).toMatchObject({ revision: 2, extensions: { '@acme/pdf-a': { enabled: true } } });
    expect(Object.keys(presetRow(current).extensions)).toEqual(['@acme/pdf-a']);
    expect(rows(current, 'SELECT COUNT(*) AS count FROM events')[0]?.['count']).toBe(events);
    expect(await enable(current, workspaceB, '@acme/pdf-b')).toEqual({ ok: true, value: { revision: 2 } });
  });

  it('M2.3-H8 enabling without granting every requested capability fails and lists what is missing', async () => {
    const current = await opened();
    const full = grantsOf(current, '@acme/asker');
    const partial = { ...full, requested: full.requested.filter((capability) => capability.name !== 'llm'), derived: { ...full.derived, subscribes: [] } };
    const denied = problemOf(await enable(current, workspaceA, '@acme/asker', partial));
    expect(denied).toMatchObject({ code: 'CAPABILITY_DENIED', params: { missing: ['llm', 'subscribes pdf.imported'], unexpected: [] } });
    expect(denied.issues).toEqual([{ path: 'grants', message: 'missing: llm' }, { path: 'grants', message: 'missing: subscribes pdf.imported' }]);
    expect(presetRow(current)).toEqual({ revision: 1, extensions: {} });
  });

  it('M2.3-H9 enabling in a workspace with no applied preset fails PRESET_REQUIRED', async () => {
    const current = await opened();
    const workspaceId = await openFolderAsWorkspace(current, temporaryFolder('workspace'));
    expect(problemOf(await enable(current, workspaceId, '@acme/desk'))).toMatchObject({ code: 'PRESET_REQUIRED' });
    expect(rows(current, 'SELECT workspace_id FROM workspace_presets WHERE workspace_id = ?', workspaceId)).toEqual([]);
  });

  it('M2.3-E12 enable writes the entry, bumps the revision, announces it, and routes the extension', async () => {
    const current = await opened();
    expect(await admission(current, 'desk.note', { lane: 'x' })).toBe('HANDLER_UNAVAILABLE');
    const grants = grantsOf(current, '@acme/desk');
    expect(await enable(current, workspaceA, '@acme/desk', grants)).toEqual({ ok: true, value: { revision: 2 } });
    const [version] = rows(current, "SELECT source, digest FROM extension_versions WHERE name = '@acme/desk'");
    expect(presetRow(current).extensions['@acme/desk']).toEqual({ source: version?.['source'], digest: version?.['digest'], enabled: true, grants });
    expect(eventsOf(current, 'kernel.preset.changed')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, revision: 2, cause: 'enable' } }]);
    expect(eventsOf(current, 'kernel.extension.enabled')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/desk' } }]);
    expect(await run(current, 'desk.note', { lane: 'x' })).toEqual({ ok: true, value: {} });
    const listed = await current.runtime.query({ sender: { address: 'user:local' }, type: 'kernel.extensions.list', payload: { workspaceId: workspaceA }, cause: undefined, workspaceId: undefined });
    expect(listed).toMatchObject({ ok: true, value: [{ name: '@acme/desk', enabledIn: [workspaceA], isolation: { [workspaceA]: 'sandboxed' } }] });
  });

  it('M2.3-E13 enabling again replaces the grants; the same grants change nothing', async () => {
    const current = await opened();
    expect(await enable(current, workspaceA, '@acme/asker', grantsOf(current, '@acme/asker', 'dedicated'))).toEqual({ ok: true, value: { revision: 2 } });
    expect(await enable(current, workspaceA, '@acme/asker', grantsOf(current, '@acme/asker', 'sandboxed'))).toEqual({ ok: true, value: { revision: 3 } });
    expect(presetRow(current).extensions['@acme/asker']).toMatchObject({ grants: { isolation: 'sandboxed' } });
    expect(await enable(current, workspaceA, '@acme/asker', grantsOf(current, '@acme/asker', 'sandboxed'))).toEqual({ ok: true, value: { revision: 3 } });
    expect(eventsOf(current, 'kernel.preset.changed').map((event) => event.payload)).toEqual([
      { workspaceId: workspaceA, revision: 2, cause: 'enable' }, { workspaceId: workspaceA, revision: 3, cause: 'enable' },
    ]);
    expect(eventsOf(current, 'kernel.extension.enabled')).toHaveLength(2);
  });

  it('M2.3-E14 an extension that is not installed, a workspace with no row, and a quarantined extension', async () => {
    const current = await opened();
    expect(problemOf(await enable(current, workspaceA, '@acme/none', grantsOf(current, '@acme/desk')))).toMatchObject({ code: 'NOT_FOUND' });
    expect(problemOf(await enable(current, 'c'.repeat(64), '@acme/desk'))).toMatchObject({ code: 'WORKSPACE_INVALID' });
    current.connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/desk'").run();
    current.runtime.registry.refresh();
    expect(problemOf(await enable(current, workspaceA, '@acme/desk'))).toMatchObject({ code: 'EXT_QUARANTINED' });
  });

  it('M2.3-E15 a snapshot changed before enable fails EXT_INTEGRITY and quarantines the extension', async () => {
    const current = await opened();
    const [row] = rows(current, "SELECT active_digest FROM extensions WHERE name = '@acme/desk'");
    appendFileSync(join(current.home, 'extensions', 'snapshots', String(row?.['active_digest']), 'node_modules', '@acme', 'desk', 'desk.js'), ' ');
    expect(problemOf(await enable(current, workspaceA, '@acme/desk'))).toMatchObject({ code: 'EXT_INTEGRITY' });
    expect(rows(current, "SELECT status, quarantine_reason FROM extensions WHERE name = '@acme/desk'")).toEqual([{ status: 'quarantined', quarantine_reason: 'EXT_INTEGRITY' }]);
  });

  it('M2.3-E16 requireTypes must be provided by an enabled extension or the kernel', async () => {
    const current = await opened();
    expect(problemOf(await enable(current, workspaceA, '@acme/reader'))).toMatchObject({ code: 'EXT_REQUIRES_MISSING', params: { types: ['pdf.import'] } });
    expect(valueOf(await enable(current, workspaceA, '@acme/pdf-a'))).toEqual({ revision: 2 });
    expect(valueOf(await enable(current, workspaceA, '@acme/reader'))).toEqual({ revision: 3 });
    expect(valueOf(await enable(current, workspaceA, '@acme/watcher'))).toEqual({ revision: 4 });
  });

  it('M2.3-E17 an invalid stored config blocks enable with CONFIG_INVALID', async () => {
    const current = await opened();
    current.connection.prepare("INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, '@acme/desk', ?, 1, 1)").run(workspaceA, JSON.stringify({ limit: 'many' }));
    expect(problemOf(await enable(current, workspaceA, '@acme/desk'))).toMatchObject({ code: 'CONFIG_INVALID', issues: [expect.objectContaining({ path: `workspaces.${workspaceA}.limit` })] });
  });

  it('M2.3-E18 only a person enables: an extension with kernel.admin is not allowed', async () => {
    const current = await opened();
    current.enable(workspaceA, '@acme/steward', grantsOf(current, '@acme/steward', 'shared'));
    const payload = { workspaceId: workspaceA, name: '@acme/desk', grants: grantsOf(current, '@acme/desk') };
    expect(await admission(current, 'kernel.extension.enable', payload, extensionActor('@acme/steward'), undefined)).toBe('CALLER_NOT_ALLOWED');
    expect(await run(current, 'steward.call', { type: 'kernel.extension.enable', payload })).toEqual({ ok: true, value: { code: 'CALLER_NOT_ALLOWED' } });
  });
});
