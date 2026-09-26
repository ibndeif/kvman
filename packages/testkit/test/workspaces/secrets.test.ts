import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { secretsFileSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, problemOf, sendAs, person, type InstallFixture } from '../install/harness.ts';
import desk from './fixtures/extensions/desk.ts';
import { admission, enable, openWorkspaceFixture, query, rows, run, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  return fixture;
}

const secret = 'sk-live-0123456789abcd';

function setSecret(current: InstallFixture, value: string, name = 'apiKey') {
  return command(current, 'kernel.secret.set', { extension: '@acme/desk', name, value });
}

function secretsFile(current: InstallFixture): Record<string, string> {
  return secretsFileSchema.parse(JSON.parse(readFileSync(join(current.home, 'secrets.json'), 'utf8')));
}

// Everything the kernel logged or published, as text a secret must never appear in.
function logsAndEvents(current: InstallFixture): string {
  return JSON.stringify([current.logged, rows(current, 'SELECT payload FROM events')]);
}

describe('secrets (plan 04 §4.7, 07 §7.5, ADR 0126)', workspaceTests, () => {
  it('M2.3-H4 secrets never appear in kernel.config.get', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    valueOf(await setSecret(current, secret));
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/desk', scope: 'global', value: { model: 'large' }, revision: 0 }));
    const byPerson = await query(current, 'kernel.config.get', { extension: '@acme/desk', workspaceId: workspaceA });
    const byExtension = await run(current, 'desk.read', { type: 'kernel.config.get', payload: { extension: '@acme/desk', workspaceId: workspaceA } });
    expect(byPerson).toMatchObject({ ok: true, value: { merged: { apiKey: '••••abcd', model: 'large' } } });
    expect(byExtension).toMatchObject({ ok: true, value: { result: { merged: { apiKey: '••••abcd' } } } });
    for (const answer of [byPerson, byExtension]) expect(JSON.stringify(answer)).not.toContain(secret);
    expect(JSON.stringify(rows(current, 'SELECT value FROM global_config UNION ALL SELECT value FROM workspace_config'))).not.toContain(secret);
    expect(secretsFile(current)).toEqual({ '@acme/desk/apiKey': secret });
  });

  it('M2.3-H6 a failed secrets-file write keeps the old value and logs the failure', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    valueOf(await setSecret(current, 'value-one-0123456'));
    mkdirSync(join(current.home, 'secrets.json.tmp'));
    expect(await setSecret(current, 'value-two-0123456')).toEqual({ ok: true, value: {} });
    expect(secretsFile(current)).toEqual({ '@acme/desk/apiKey': 'value-one-0123456' });
    expect(await run(current, 'desk.settings', {})).toMatchObject({ ok: true, value: { apiKey: 'value-one-0123456' } });
    expect(current.logged).toContainEqual(expect.objectContaining({ level: 'error', fields: expect.objectContaining({ extensions: ['@acme/desk'], names: ['apiKey'] }) }));
    for (const value of ['value-one-0123456', 'value-two-0123456']) expect(logsAndEvents(current)).not.toContain(value);
  });

  it('M2.3-E37 set, clear, and clear again', async () => {
    const current = await opened();
    valueOf(await setSecret(current, secret));
    expect(statSync(join(current.home, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(secretsFile(current)).toEqual({ '@acme/desk/apiKey': secret });
    expect(await command(current, 'kernel.secret.clear', { extension: '@acme/desk', name: 'apiKey' })).toEqual({ ok: true, value: {} });
    expect(secretsFile(current)).toEqual({});
    expect(await query(current, 'kernel.config.get', { extension: '@acme/desk' })).toEqual({ ok: true, value: { global: { value: {}, revision: 0 }, workspace: null, merged: { model: 'small', limit: 10 } } });
    expect(await command(current, 'kernel.secret.clear', { extension: '@acme/desk', name: 'apiKey' })).toEqual({ ok: true, value: {} });
  });

  it('M2.3-E38 undeclared names, unknown extensions, empty and oversized values, and non-admin senders are refused', async () => {
    const current = await opened();
    const undeclared = problemOf(await setSecret(current, 'x', 'token'));
    expect(undeclared).toMatchObject({ code: 'VALIDATION_FAILED', params: { declared: ['apiKey'] } });
    expect(problemOf(await command(current, 'kernel.secret.set', { extension: '@acme/none', name: 'apiKey', value: 'x' }))).toMatchObject({ code: 'NOT_FOUND' });
    expect(await admission(current, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: '' })).toBe('VALIDATION_FAILED');
    expect(problemOf(await setSecret(current, 'x'.repeat(64 * 1024 + 1)))).toMatchObject({ code: 'VALIDATION_FAILED' });
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    expect(await run(current, 'desk.call', { type: 'kernel.secret.set', payload: { extension: '@acme/desk', name: 'apiKey', value: 'x' } })).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
  });

  it('M2.3-E39 secret writes committed together reach the file in commit order', async () => {
    const current = await opened();
    const first = await sendAs(current, person, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'one' });
    const second = await sendAs(current, person, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'two' });
    expect(await Promise.all([current.runtime.awaitReply(first), current.runtime.awaitReply(second)])).toEqual([{ ok: true, value: {} }, { ok: true, value: {} }]);
    expect(secretsFile(current)).toEqual({ '@acme/desk/apiKey': 'two' });
  });

  it('M2.3-E40 uninstall keeps an extension\'s secrets unless its data is deleted', async () => {
    const current = await opened();
    valueOf(await setSecret(current, secret));
    valueOf(await command(current, 'kernel.extension.uninstall', { name: '@acme/desk' }));
    expect(secretsFile(current)).toEqual({ '@acme/desk/apiKey': secret });
    await installFixture(current.connection, current.home, { definition: desk, folder: join(import.meta.dirname, 'fixtures', 'extensions'), entry: 'desk.ts' });
    current.runtime.registry.refresh();
    valueOf(await command(current, 'kernel.extension.uninstall', { name: '@acme/desk', deleteData: true }));
    expect(secretsFile(current)).toEqual({});
  });

  it('M2.3-E41 no log line and no event holds a secret value', async () => {
    const current = await opened();
    valueOf(await setSecret(current, secret));
    valueOf(await command(current, 'kernel.secret.clear', { extension: '@acme/desk', name: 'apiKey' }));
    mkdirSync(join(current.home, 'secrets.json.tmp'));
    valueOf(await setSecret(current, `${secret}-failed`));
    expect(current.logged.length).toBeGreaterThan(0);
    expect(logsAndEvents(current)).not.toContain(secret);
  });
});
