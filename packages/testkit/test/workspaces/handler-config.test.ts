import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { secretsFileSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, problemOf, type InstallFixture } from '../install/harness.ts';
import { enable, eventsOf, openWorkspaceFixture, query, rows, run, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function withDesk(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  valueOf(await enable(fixture, workspaceA, '@acme/desk'));
  return fixture;
}

function secretsFile(current: InstallFixture): Record<string, string> {
  return secretsFileSchema.parse(JSON.parse(readFileSync(join(current.home, 'secrets.json'), 'utf8')));
}

describe("handlers' ctx.config and ctx.secrets (plan 05 §5.8, ADRs 0125, 0126)", workspaceTests, () => {
  it('M2.3-E44 ctx.config.get merges the rows with the handler\'s own set, without secrets; a failed handler writes nothing', async () => {
    const current = await withDesk();
    valueOf(await command(current, 'kernel.config.set', { extension: '@acme/desk', scope: 'global', value: { model: 'large' }, revision: 0 }));
    valueOf(await command(current, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value: 'sk-live-0123456789abcd' }));
    expect(await run(current, 'desk.remember', { limit: 3 })).toEqual({ ok: true, value: { model: 'large', limit: 3 } });
    expect(rows(current, "SELECT value, revision FROM workspace_config WHERE extension = '@acme/desk'")).toEqual([{ value: JSON.stringify({ limit: 3 }), revision: 1 }]);
    expect(eventsOf(current, 'kernel.config.changed').at(-1)).toEqual({ workspaceId: workspaceA, payload: { extension: '@acme/desk', scope: 'workspace', workspaceId: workspaceA, revision: 1 } });
    expect(problemOf(await run(current, 'desk.remember', { limit: 4, fail: true }))).toMatchObject({ code: 'desk/FAILED' });
    expect(rows(current, "SELECT value, revision FROM workspace_config WHERE extension = '@acme/desk'")).toEqual([{ value: JSON.stringify({ limit: 3 }), revision: 1 }]);
  });

  it('M2.3-E45 invalid values, workspace values without a workspace, and scopes the schema does not allow', async () => {
    const current = await withDesk();
    valueOf(await enable(current, workspaceA, '@acme/pdf-a'));
    const bad = await run(current, 'desk.config.bad', {});
    expect(problemOf(bad)).toMatchObject({ code: 'CONFIG_INVALID', retryable: false });
    expect(rows(current, "SELECT state FROM messages WHERE type = 'desk.config.bad'")).toEqual([{ state: 'failed' }]);
    expect(await run(current, 'desk.config.unscoped', {})).toEqual({ ok: true, value: { code: 'WORKSPACE_INVALID' } });
    expect(problemOf(await run(current, 'pdf.config.global', {}))).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(rows(current, 'SELECT extension FROM global_config UNION ALL SELECT extension FROM workspace_config')).toEqual([]);
  });

  it('M2.3-E46 ctx.secrets reads its own pending sets, reaches the file after commit, checks names, and is read-only in queries', async () => {
    const current = await withDesk();
    expect(await run(current, 'desk.secret.keep', { value: 'abc' })).toEqual({ ok: true, value: { seen: 'abc' } });
    expect(secretsFile(current)).toEqual({ '@acme/desk/oauth.token': 'abc' });
    expect(await query(current, 'desk.secret.peek', {}, undefined, workspaceA)).toEqual({ ok: true, value: { value: 'abc', set: 'CAPABILITY_DENIED' } });
    expect(await run(current, 'desk.secret.drop', {})).toEqual({ ok: true, value: { seen: null } });
    expect(secretsFile(current)).toEqual({});
    expect(await run(current, 'desk.secret.badname', {})).toEqual({ ok: true, value: { code: 'VALIDATION_FAILED' } });
  });
});
