import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA, workspaceB } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { query, rows, run, valueOf } from '../workspaces/harness.ts';
import { enableAt, enableWithGrant, isolationTests, openIsolationFixture } from '../isolation/harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openIsolationFixture();
});
afterEach(async () => {
  await fixture.close();
});

function deliveries(extension: string, workspaceId: string): Array<Record<string, unknown>> {
  return rows(fixture, "SELECT state FROM messages WHERE type = 'probe.worked' AND kind = 'event' AND handler LIKE ? AND workspace_id = ?", `${extension}|%`, workspaceId);
}

describe('event delivery (plan 05 §5.7 subscribes, ADR 0052)', isolationTests, () => {
  it('M2.4-H4 a foreign event reaches only granted subscribers', async () => {
    for (const name of ['@acme/probe', '@acme/bystander']) enableAt(fixture, workspaceA, name, 'shared');
    enableWithGrant(fixture, workspaceA, '@acme/listener', (grants) => ({ ...grants, isolation: 'shared', derived: { ...grants.derived, subscribes: [] } }));
    for (const name of ['@acme/probe', '@acme/listener']) enableAt(fixture, workspaceB, name, 'shared');
    for (const workspaceId of [workspaceA, workspaceB]) valueOf(await run(fixture, 'probe.work', { text: 'x' }, workspaceId));
    await eventually(async () => expect(await query(fixture, 'listener.heard', {}, undefined, workspaceB)).toEqual({ ok: true, value: 1 }));
    expect(deliveries('@acme/bystander', workspaceA)).toEqual([]);
    expect(deliveries('@acme/listener', workspaceA)).toEqual([]);
    expect(deliveries('@acme/listener', workspaceB)).toEqual([{ state: 'done' }]);
    expect(await query(fixture, 'listener.heard', {}, undefined, workspaceA)).toEqual({ ok: true, value: 0 });
  });
});
