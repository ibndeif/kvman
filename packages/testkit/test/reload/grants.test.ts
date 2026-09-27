import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { command, person, problemOf } from '../install/harness.ts';
import { enable, eventsOf, grantsOf, presetRow, query, valueOf } from '../workspaces/harness.ts';
import { enableNotes, grantsForVersion, notesName, notesRow, openReloadFixture, reload, reloadTests, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const workspaceC = 'c'.repeat(64);

function notesEntry(current: ReloadFixture, workspaceId: string): Record<string, unknown> {
  return jsonObjectSchema.parse(presetRow(current, workspaceId).extensions[notesName]);
}

async function listedStatus(current: ReloadFixture): Promise<unknown> {
  const answer = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await query(current, 'kernel.extensions.list', {}))));
  const listing = [answer['value']].flat().map((entry) => jsonObjectSchema.parse(entry)).find((entry) => entry['name'] === notesName);
  return listing?.['status'];
}

describe('reload grants (plan 06 §6.6 step 2, ADR 0145)', reloadTests, () => {
  it('M2.7-H5 an upgrade that requests a new capability fails until reloaded with grants', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.1.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enableNotes(fixture, workspaceB));
    const digest = fixture.digestOf('2.1.0');
    const problem = problemOf(await reload(fixture, { digest }));
    expect(problem).toMatchObject({ code: 'EXT_GRANTS_REQUIRED', params: { digest, workspaces: [{ workspaceId: workspaceA, missing: ['process'] }, { workspaceId: workspaceB, missing: ['process'] }] } });
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.0.0'), pendingDigest: digest, stored: 1 });
    expect(await listedStatus(fixture)).toBe('needs-approval');
    const grants = grantsForVersion(fixture, '2.1.0');
    expect(valueOf(await reload(fixture, { digest, grants: { [workspaceA]: grants, [workspaceB]: grants } }))).toEqual({ digest });
    expect(notesRow(fixture)).toMatchObject({ activeDigest: digest, pendingDigest: null, stored: 2 });
    for (const workspaceId of [workspaceA, workspaceB]) expect(notesEntry(fixture, workspaceId)).toMatchObject({ digest, source: `local:${digest}`, grants });
    expect(eventsOf(fixture, 'kernel.preset.changed').filter((event) => jsonObjectSchema.parse(event.payload)['cause'] === 'enable').map((event) => event.workspaceId).slice(-2)).toEqual([workspaceA, workspaceB]);
    expect(await listedStatus(fixture)).toBe('active');
  });

  it("M2.7-E15 reload grants follow enable's rules", async () => {
    fixture = await openReloadFixture(['1.0.0', '2.1.0', '2.0.0']);
    applyTestPreset(fixture.connection, { workspaceId: workspaceC, path: '/w/c', name: 'C' });
    fixture.runtime.registry.refresh();
    valueOf(await enableNotes(fixture, workspaceA));
    valueOf(await enableNotes(fixture, workspaceB));
    const digest = fixture.digestOf('2.1.0');
    const next = grantsForVersion(fixture, '2.1.0');
    expect(problemOf(await reload(fixture, { digest, grants: { [workspaceA]: next } }))).toMatchObject({ code: 'EXT_GRANTS_REQUIRED', params: { workspaces: [{ workspaceId: workspaceB, missing: ['process'] }] } });
    expect(problemOf(await reload(fixture, { digest, grants: { [workspaceC]: next } })).code).toBe('VALIDATION_FAILED');
    expect(problemOf(await reload(fixture, { digest, grants: { [workspaceA]: grantsOf(fixture, notesName) } }))).toMatchObject({ code: 'CAPABILITY_DENIED', issues: [{ path: `grants.${workspaceA}`, message: 'missing: process' }] });
    valueOf(await reload(fixture, { digest, grants: { [workspaceA]: next, [workspaceB]: next } }));
    const plain = grantsForVersion(fixture, '2.0.0');
    valueOf(await reload(fixture, { digest: fixture.digestOf('2.0.0'), grants: { [workspaceB]: plain } }));
    expect(notesEntry(fixture, workspaceA)['grants']).toEqual(plain);
    expect(notesEntry(fixture, workspaceB)['grants']).toEqual(plain);
  });

  it('M2.7-E16 a reload with grants is a grant command; without grants it is for administrators', async () => {
    fixture = await openReloadFixture(['1.0.0', '2.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    for (const name of ['@acme/steward', '@acme/caller']) valueOf(await enable(fixture, workspaceA, name, grantsOf(fixture, name)));
    const payload = { name: notesName };
    const steward = valueOf(await command(fixture, 'steward.call', { type: 'kernel.extension.reload', payload }, person, workspaceA));
    expect(steward).toEqual({ result: { digest: fixture.digestOf('1.0.0') } });
    const withGrants = { name: notesName, grants: { [workspaceA]: grantsOf(fixture, notesName) } };
    expect(valueOf(await command(fixture, 'steward.call', { type: 'kernel.extension.reload', payload: withGrants }, person, workspaceA))).toEqual({ code: 'CALLER_NOT_ALLOWED' });
    expect(valueOf(await command(fixture, 'caller.call', { type: 'kernel.extension.reload', payload }, person, workspaceA))).toEqual({ ok: false, code: 'CAPABILITY_DENIED' });
  });
});
