import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, problemOf, type InstallFixture } from '../install/harness.ts';
import { admission, enable, eventsOf, openWorkspaceFixture, presetRow, query, rows, run, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  return fixture;
}

const desk = '@acme/desk';

function setConfig(current: InstallFixture, scope: 'global' | 'workspace', value: Record<string, string | number>, revision: number, workspaceId = workspaceA) {
  return command(current, 'kernel.config.set', { extension: desk, scope, ...(scope === 'workspace' ? { workspaceId } : {}), value, revision });
}

describe('config values through the kernel (plan 07 §7.5, ADR 0125)', workspaceTests, () => {
  it('M2.3-H3 a stale config revision fails CONFIG_STALE', async () => {
    const current = await opened();
    expect(await setConfig(current, 'workspace', { limit: 3 }, 0)).toEqual({ ok: true, value: { revision: 1 } });
    expect(problemOf(await setConfig(current, 'workspace', { limit: 5 }, 0))).toMatchObject({ code: 'CONFIG_STALE' });
    expect(rows(current, 'SELECT value, revision FROM workspace_config WHERE workspace_id = ? AND extension = ?', workspaceA, desk)).toEqual([{ value: JSON.stringify({ limit: 3 }), revision: 1 }]);
    expect(await setConfig(current, 'workspace', { limit: 5 }, 1)).toEqual({ ok: true, value: { revision: 2 } });
  });

  it('M2.3-H7 a config write leaves the applied preset\'s revision unchanged', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/gate'));
    valueOf(await enable(current, workspaceA, desk));
    expect(presetRow(current).revision).toBe(3);
    const presetEvents = eventsOf(current, 'kernel.preset.changed').length;
    valueOf(await setConfig(current, 'workspace', { limit: 3 }, 0));
    valueOf(await setConfig(current, 'global', { model: 'large' }, 0));
    valueOf(await run(current, 'desk.remember', { limit: 4 }));
    expect(presetRow(current).revision).toBe(3);
    expect(eventsOf(current, 'kernel.preset.changed')).toHaveLength(presetEvents);
    expect(eventsOf(current, 'kernel.config.changed')).toHaveLength(3);
  });

  it('M2.3-E32 each row has its own revision; writes are announced; kernel.config.get merges them', async () => {
    const current = await opened();
    expect(await setConfig(current, 'global', { model: 'medium', limit: 20 }, 0)).toEqual({ ok: true, value: { revision: 1 } });
    expect(await setConfig(current, 'workspace', { model: 'large' }, 0)).toEqual({ ok: true, value: { revision: 1 } });
    expect(await setConfig(current, 'global', { limit: 30 }, 1)).toEqual({ ok: true, value: { revision: 2 } });
    expect(eventsOf(current, 'kernel.config.changed')).toEqual([
      { workspaceId: null, payload: { extension: desk, scope: 'global', revision: 1 } },
      { workspaceId: workspaceA, payload: { extension: desk, scope: 'workspace', workspaceId: workspaceA, revision: 1 } },
      { workspaceId: null, payload: { extension: desk, scope: 'global', revision: 2 } },
    ]);
    expect(await query(current, 'kernel.config.get', { extension: desk, workspaceId: workspaceA })).toEqual({
      ok: true, value: { global: { value: { limit: 30 }, revision: 2 }, workspace: { value: { model: 'large' }, revision: 1 }, merged: { model: 'large', limit: 30 } },
    });
  });

  it('M2.3-E33 missing rows read as revision 0; unknown extensions and extensions without config are NOT_FOUND', async () => {
    const current = await opened();
    const empty = { value: {}, revision: 0 };
    expect(await query(current, 'kernel.config.get', { extension: desk, workspaceId: workspaceA })).toEqual({ ok: true, value: { global: empty, workspace: empty, merged: { model: 'small', limit: 10 } } });
    expect(await query(current, 'kernel.config.get', { extension: desk })).toEqual({ ok: true, value: { global: empty, workspace: null, merged: { model: 'small', limit: 10 } } });
    expect(await query(current, 'kernel.config.get', { extension: '@acme/none' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND' } });
    expect(await query(current, 'kernel.config.get', { extension: '@acme/gate' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND', detail: '@acme/gate has no config' } });
  });

  it('M2.3-E34 values the schema refuses, secrets in config, and missing or unknown workspaces', async () => {
    const current = await opened();
    expect(problemOf(await setConfig(current, 'workspace', { limit: 'many' }, 0))).toMatchObject({ code: 'CONFIG_INVALID', issues: [expect.objectContaining({ path: 'limit' })] });
    expect(problemOf(await setConfig(current, 'global', { apiKey: 'sk-1' }, 0))).toMatchObject({
      code: 'CONFIG_INVALID', hint: 'set it with kernel.secret.set or ctx.secrets.set', issues: [expect.objectContaining({ path: 'apiKey' })],
    });
    expect(problemOf(await command(current, 'kernel.config.set', { extension: desk, scope: 'workspace', value: { limit: 1 }, revision: 0 }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(problemOf(await setConfig(current, 'workspace', { limit: 1 }, 0, 'c'.repeat(64)))).toMatchObject({ code: 'WORKSPACE_INVALID' });
    expect(rows(current, 'SELECT extension FROM global_config UNION ALL SELECT extension FROM workspace_config')).toEqual([]);
  });

  it('M2.3-E35 kernel.config.set is admin only; kernel.config.get is open to every extension', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, desk));
    valueOf(await enable(current, workspaceA, '@acme/steward'));
    const payload = { extension: desk, scope: 'global', value: { limit: 2 }, revision: 0 };
    expect(await run(current, 'desk.call', { type: 'kernel.config.set', payload })).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    expect(await run(current, 'steward.call', { type: 'kernel.config.set', payload })).toEqual({ ok: true, value: { result: { revision: 1 } } });
    expect(await run(current, 'desk.read', { type: 'kernel.config.get', payload: { extension: desk } })).toMatchObject({ ok: true, value: { result: { merged: { limit: 2 } } } });
  });

  it('M2.3-E36 config can be written for an installed extension that is not enabled there', async () => {
    const current = await opened();
    expect(await admission(current, 'desk.note', { lane: 'x' }, undefined, workspaceB)).toBe('HANDLER_UNAVAILABLE');
    expect(await setConfig(current, 'workspace', { limit: 7 }, 0, workspaceB)).toEqual({ ok: true, value: { revision: 1 } });
  });
});
