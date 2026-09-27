import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf } from '../install/harness.ts';
import { eventsOf, grantsOf, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesItems, notesName, notesRow, openReloadFixture, reload, reloadTests, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function rollback(current: ReloadFixture, digest: string): ReturnType<typeof command> {
  return command(current, 'kernel.extension.rollback', { name: notesName, digest }, person);
}

// Changes one byte of a snapshot's entry module.
function tamper(current: ReloadFixture, digest: string, entry: string): void {
  appendFileSync(join(current.home, 'extensions', 'snapshots', digest, 'node_modules', notesName, entry), ' ');
}

// Notes at 2.0.0 with its data at version 2, enabled in A.
async function atVersionTwo(versions: Parameters<typeof openReloadFixture>[0]): Promise<ReloadFixture> {
  const opened = await openReloadFixture(versions);
  valueOf(await enableNotes(opened, workspaceA));
  await addNote(opened, workspaceA, 'n1', 'one');
  valueOf(await reload(opened, { digest: opened.digestOf('2.0.0') }));
  return opened;
}

describe('kernel.extension.rollback (plan 06 §6.7, ADRs 0142, 0145)', reloadTests, () => {
  it('M2.7-E21 a reload to a lower data version fails EXT_ROLLBACK_BLOCKED', async () => {
    fixture = await atVersionTwo(['1.0.0', '2.0.0']);
    expect(problemOf(await reload(fixture, { digest: fixture.digestOf('1.0.0') }))).toMatchObject({ code: 'EXT_ROLLBACK_BLOCKED', params: { stored: 2, target: 1 } });
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('2.0.0'), stored: 2 });
  });

  it('M2.7-E23 rollback targets any installed digest; a tampered target fails without quarantine', async () => {
    fixture = await openReloadFixture(['1.0.0', '1.1.0', '2.0.0']);
    valueOf(await enableNotes(fixture, workspaceA));
    const compatible = fixture.digestOf('1.1.0');
    expect(valueOf(await rollback(fixture, compatible))).toEqual({ digest: compatible });
    expect(notesRow(fixture).activeDigest).toBe(compatible);
    expect(eventsOf(fixture, 'kernel.extension.reloaded')).toHaveLength(1);
    expect(valueOf(await rollback(fixture, compatible))).toEqual({ digest: compatible });
    expect(problemOf(await rollback(fixture, 'f'.repeat(64))).code).toBe('NOT_FOUND');
    tamper(fixture, fixture.digestOf('2.0.0'), 'notes-2.js');
    expect(problemOf(await rollback(fixture, fixture.digestOf('2.0.0'))).code).toBe('EXT_INTEGRITY');
    expect(notesRow(fixture)).toMatchObject({ activeDigest: compatible, status: 'active', reason: null });
  });

  it('M2.7-E24 rollback to a lower data version is blocked unless the target covers it', async () => {
    fixture = await atVersionTwo(['1.0.0', '2.0.0', '1.1.0']);
    expect(problemOf(await rollback(fixture, fixture.digestOf('1.0.0')))).toMatchObject({ code: 'EXT_ROLLBACK_BLOCKED', params: { stored: 2, target: 1 } });
    const items = notesItems(fixture);
    expect(valueOf(await rollback(fixture, fixture.digestOf('1.1.0')))).toEqual({ digest: fixture.digestOf('1.1.0') });
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.1.0'), stored: 2 });
    expect(notesItems(fixture)).toEqual(items);
  });

  it('M2.7-E25 rollback clears an EXT_INTEGRITY quarantine', async () => {
    const current = await openReloadFixture(['2.0.0', '1.1.0']);
    fixture = current;
    fixture.enable(workspaceA, notesName, grantsOf(fixture, notesName));
    tamper(fixture, fixture.digestOf('2.0.0'), 'notes-2.js');
    expect(problemOf(await command(fixture, 'notes.add', { id: 'n1', text: 'one' }, person, workspaceA)).code).toBe('EXT_INTEGRITY');
    await vi.waitFor(() => expect(notesRow(current)).toMatchObject({ status: 'quarantined', reason: 'EXT_INTEGRITY' }), { timeout: 30_000, interval: 20 });
    expect(problemOf(await reload(fixture, { digest: fixture.digestOf('2.0.0') })).code).toBe('EXT_INTEGRITY');
    expect(notesRow(fixture)).toMatchObject({ status: 'quarantined', reason: 'EXT_INTEGRITY' });
    valueOf(await rollback(fixture, fixture.digestOf('1.1.0')));
    expect(notesRow(fixture)).toMatchObject({ activeDigest: fixture.digestOf('1.1.0'), status: 'active', reason: null });
    expect(eventsOf(fixture, 'kernel.extension.unquarantined').map((event) => event.payload)).toEqual([{ name: notesName }]);
    await addNote(fixture, workspaceA, 'n2', 'two');
    expect(notesItems(fixture).map((item) => item.data)).toEqual([{ id: 'n2', text: 'two' }]);
  });
});
