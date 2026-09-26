import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, problemOf, type InstallFixture } from '../install/harness.ts';
import { admission, disable, enable, eventsOf, openWorkspaceFixture, presetRow, rows, run, start, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  return fixture;
}

function stateOf(current: InstallFixture, id: string): unknown {
  return rows(current, 'SELECT state FROM messages WHERE id = ?', id)[0]?.['state'];
}

describe('kernel.extension.disable (plan 06 §6.4, ADR 0123)', workspaceTests, () => {
  it('M2.3-H2 disabling a required extension fails EXT_IN_USE with the dependents', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/pdf-a'));
    valueOf(await enable(current, workspaceA, '@acme/reader'));
    expect(problemOf(await disable(current, workspaceA, '@acme/pdf-a'))).toMatchObject({ code: 'EXT_IN_USE', params: { dependents: ['@acme/reader'] } });
    expect(presetRow(current)).toMatchObject({ revision: 3, extensions: { '@acme/pdf-a': { enabled: true }, '@acme/reader': { enabled: true } } });
    expect(await disable(current, workspaceA, '@acme/reader')).toEqual({ ok: true, value: { revision: 4 } });
    expect(await disable(current, workspaceA, '@acme/pdf-a')).toEqual({ ok: true, value: { revision: 5 } });
  });

  it('M2.3-E21 disable keeps the grants; in-flight work finishes, new work is refused, pending work waits for a re-enable', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/gate'));
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    const hold = await start(current, 'desk.hold', { lane: 'x' });
    await eventually(() => expect(rows(current, "SELECT id FROM messages WHERE type = 'gate.wait' AND state = 'awaiting'")).toHaveLength(1));
    const gateWait = String(rows(current, "SELECT id FROM messages WHERE type = 'gate.wait'")[0]?.['id']);
    const behind = await start(current, 'desk.note', { lane: 'x' });
    const grants = jsonObjectSchema.parse(presetRow(current).extensions['@acme/desk'])['grants'];
    expect(await disable(current, workspaceA, '@acme/desk')).toEqual({ ok: true, value: { revision: 4 } });
    expect(presetRow(current).extensions['@acme/desk']).toMatchObject({ enabled: false, grants });
    expect(eventsOf(current, 'kernel.preset.changed').at(-1)?.payload).toEqual({ workspaceId: workspaceA, revision: 4, cause: 'disable' });
    expect(eventsOf(current, 'kernel.extension.disabled')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA, name: '@acme/desk' } }]);
    expect(await admission(current, 'desk.note', { lane: 'y' })).toBe('HANDLER_UNAVAILABLE');
    expect(await run(current, 'gate.open', { commandId: gateWait })).toEqual({ ok: true, value: {} });
    expect(await current.runtime.awaitReply(hold)).toEqual({ ok: true, value: {} });
    expect(stateOf(current, behind)).toBe('pending');
    expect(await enable(current, workspaceA, '@acme/desk')).toEqual({ ok: true, value: { revision: 5 } });
    expect(await current.runtime.awaitReply(behind)).toEqual({ ok: true, value: {} });
  });

  it('M2.3-E22 disabling an extension that is not in the preset, or already disabled, changes nothing', async () => {
    const current = await opened();
    expect(await disable(current, workspaceA, '@acme/desk')).toEqual({ ok: true, value: { revision: 1 } });
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    valueOf(await disable(current, workspaceA, '@acme/desk'));
    expect(await disable(current, workspaceA, '@acme/desk')).toEqual({ ok: true, value: { revision: 3 } });
    expect(eventsOf(current, 'kernel.extension.disabled')).toHaveLength(1);
  });

  it('M2.3-E23 disabled in every workspace, a quarantined extension is released', async () => {
    const current = await opened();
    for (const workspaceId of [workspaceA, workspaceB]) valueOf(await enable(current, workspaceId, '@acme/desk'));
    current.connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/desk'").run();
    current.runtime.registry.refresh();
    valueOf(await disable(current, workspaceA, '@acme/desk'));
    expect(rows(current, "SELECT status FROM extensions WHERE name = '@acme/desk'")).toEqual([{ status: 'quarantined' }]);
    valueOf(await disable(current, workspaceB, '@acme/desk'));
    expect(rows(current, "SELECT status, quarantine_reason FROM extensions WHERE name = '@acme/desk'")).toEqual([{ status: 'active', quarantine_reason: null }]);
    expect(eventsOf(current, 'kernel.extension.unquarantined')).toEqual([{ workspaceId: null, payload: { name: '@acme/desk' } }]);
  });

  it('M2.3-E24 disable is admin only', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    expect(await run(current, 'desk.call', { type: 'kernel.extension.disable', payload: { workspaceId: workspaceA, name: '@acme/desk' } })).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    expect(presetRow(current).extensions['@acme/desk']).toMatchObject({ enabled: true });
  });

  it('M2.3-E25 uninstall reads the workspaces that enable the extension from their presets', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    expect(problemOf(await command(current, 'kernel.extension.uninstall', { name: '@acme/desk' }))).toMatchObject({ code: 'EXT_IN_USE', params: { workspaces: [workspaceA] } });
    valueOf(await disable(current, workspaceA, '@acme/desk'));
    expect(await command(current, 'kernel.extension.uninstall', { name: '@acme/desk' })).toEqual({ ok: true, value: {} });
  });
});
