import type { Sender } from '@kvman/kernel';
import type { Json } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { problemOf, type InstallFixture } from '../install/harness.ts';
import { admission, enable, grantsOf, presetRow, rows, run, valueOf } from '../workspaces/harness.ts';
import { disableTools, enableAt, enableWithGrant, isolationTests, openIsolationFixture } from '../isolation/harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const wardenProcess: Sender = { address: 'proc:01JAZ3K4M5N6P7Q8R9S0T1V2W3', extension: '@acme/warden' };

async function tried(surface: string): Promise<Json> {
  return valueOf(await run(fixture, 'intruder.try', { surface }));
}

async function used(type: string, kind: 'command' | 'query', global = false): Promise<Json> {
  return valueOf(await run(fixture, global ? 'assistant.global.use' : 'assistant.use', { type, kind }, global ? undefined : workspaceA));
}

function wardenCall(type: string, payload: Json): Promise<Json> {
  return run(fixture, 'warden.call', { type, payload }).then(valueOf);
}

describe('capability enforcement on ctx (plan 05 §5.7, 03 §3.8, ADRs 0052, 0133)', isolationTests, () => {
  it('M2.4-H2 every ctx surface denies without its capability', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    enableAt(fixture, workspaceA, '@acme/intruder', 'sandboxed');
    for (const surface of ['command', 'query', 'live', 'tool', 'lookup', 'rename', 'messages']) {
      expect({ surface, outcome: await tried(surface) }).toEqual({ surface, outcome: { code: 'CAPABILITY_DENIED' } });
    }
    expect(problemOf(await run(fixture, 'intruder.send')).code).toBe('CAPABILITY_DENIED');
    expect(problemOf(await run(fixture, 'intruder.publish')).code).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, "SELECT type FROM messages WHERE source = 'ext:@acme/intruder' AND type LIKE 'probe.%'")).toEqual([]);
    expect(rows(fixture, "SELECT count(*) AS count FROM events WHERE type = 'probe.worked'")).toEqual([{ count: 0 }]);
    expect(rows(fixture, 'SELECT name FROM workspaces WHERE id = ?', workspaceA)).toEqual([{ name: 'A' }]);
  });

  it('M2.4-E23 the grant checked is the calling invocation\'s', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    enableAt(fixture, workspaceA, '@acme/caller', 'shared');
    enableWithGrant(fixture, workspaceB, '@acme/caller', (grants) => ({ ...grants, isolation: 'shared', requested: [] }));
    expect(valueOf(await run(fixture, 'caller.ping'))).toMatchObject({ result: { pid: process.pid } });
    expect(valueOf(await run(fixture, 'caller.global', {}, undefined))).toEqual({ code: 'CAPABILITY_DENIED' });
  });

  it('M2.4-E24 tools covers the workspace\'s enabled, not disabled agent tools', async () => {
    enableAt(fixture, workspaceA, '@acme/probe', 'shared');
    enableAt(fixture, workspaceA, '@acme/assistant', 'shared');
    expect([await used('probe.tool', 'command'), await used('probe.lookup', 'query'), await used('probe.work', 'command')])
      .toEqual([{ result: { tool: true } }, { result: { found: true } }, { code: 'CAPABILITY_DENIED' }]);
    disableTools(fixture, workspaceA, '@acme/probe', ['probe.tool']);
    expect([await used('probe.tool', 'command'), await used('probe.lookup', 'query')]).toEqual([{ code: 'CAPABILITY_DENIED' }, { result: { found: true } }]);
    expect(await used('probe.global.tool', 'command')).toEqual({ result: { tool: true } });
    expect(await used('probe.global.tool', 'command', true)).toEqual({ code: 'CAPABILITY_DENIED' });
  });

  it('M2.4-E29 grant commands accept only a person', async () => {
    enableAt(fixture, workspaceA, '@acme/warden', 'shared');
    expect(await wardenCall('kernel.workspace.rename', { workspaceId: workspaceA, name: 'Renamed' })).toEqual({ result: {} });
    const grants = grantsOf(fixture, '@acme/probe');
    const attempts: Array<[string, Json]> = [
      ['kernel.extension.enable', { workspaceId: workspaceA, name: '@acme/probe', grants }],
      ['kernel.workspace.forget', { workspaceId: workspaceB }],
      ['kernel.extension.uninstall', { name: '@acme/probe' }],
      ['kernel.shutdown', {}],
    ];
    for (const [type, payload] of attempts) expect({ type, outcome: await wardenCall(type, payload) }).toEqual({ type, outcome: { code: 'CALLER_NOT_ALLOWED' } });
    expect(await admission(fixture, 'kernel.extension.enable', { workspaceId: workspaceA, name: '@acme/probe', grants }, wardenProcess, undefined)).toBe('CALLER_NOT_ALLOWED');
    expect(presetRow(fixture).extensions['@acme/probe']).toBeUndefined();
    expect(rows(fixture, 'SELECT id FROM workspaces WHERE id = ?', workspaceB)).toHaveLength(1);
    expect(await enable(fixture, workspaceA, '@acme/probe', grants)).toMatchObject({ ok: true });
  });
});
