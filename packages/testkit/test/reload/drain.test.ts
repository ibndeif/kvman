import { jsonObjectSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { person, sendAs } from '../install/harness.ts';
import { query, rows, valueOf } from '../workspaces/harness.ts';
import { addNote, enableNotes, notesItems, openReloadFixture, reload, reloadTests, versionIn, type ReloadFixture } from './harness.ts';

let fixture: ReloadFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function stateOf(current: ReloadFixture, messageId: string): { state: unknown; attempts: unknown } {
  const [row] = rows(current, 'SELECT state, attempts FROM messages WHERE id = ?', messageId);
  return { state: row?.['state'], attempts: row?.['attempts'] };
}

// Notes 1.0.0 enabled in A with notes.hold running, and a reload to 2.0.0 draining it.
async function draining(): Promise<{ current: ReloadFixture; hold: string; reloading: ReturnType<typeof reload> }> {
  const current = await openReloadFixture(['1.0.0', '2.0.0']);
  valueOf(await enableNotes(current, workspaceA));
  await addNote(current, workspaceA, 'n0', 'zero');
  const hold = await sendAs(current, person, 'notes.hold', {}, workspaceA);
  await vi.waitFor(() => expect(stateOf(current, hold).state).toBe('running'), { timeout: 30_000, interval: 20 });
  const reloading = reload(current, { digest: current.digestOf('2.0.0') });
  await vi.waitFor(() => expect(current.runtime.registry.current().isReloading('@acme/notes')).toBe(true), { timeout: 30_000, interval: 5 });
  return { current, hold, reloading };
}

describe('the drain of a reload (plan 06 §6.6 step 3, ADR 0145)', reloadTests, () => {
  it('M2.7-H9 a query during a reload fails HANDLER_UNAVAILABLE and succeeds after the delay', async () => {
    const { current, reloading } = await draining();
    fixture = current;
    const refused = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await query(current, 'notes.version.get', {}, person, workspaceA))));
    expect(refused).toMatchObject({ ok: false, problem: { code: 'HANDLER_UNAVAILABLE', retryable: true, retryAfterMs: 1000 } });
    current.timers.advance(10_000);
    valueOf(await reloading);
    current.timers.advance(1000);
    expect(await versionIn(current, workspaceA)).toBe('2.0.0');
  });

  it('M2.7-E17 the drain lets commands wait and redelivers an aborted invocation without an attempt', async () => {
    const { current, hold, reloading } = await draining();
    fixture = current;
    const add = await sendAs(current, person, 'notes.add', { id: 'n1', text: 'one' }, workspaceA);
    expect(stateOf(current, add).state).toBe('pending');
    const attempts = stateOf(current, hold).attempts;
    current.timers.advance(10_000);
    valueOf(await reloading);
    valueOf(await current.runtime.awaitReply(add));
    expect(notesItems(current).find((item) => item.id === 'n1')?.data).toEqual({ id: 'n1', title: 'one' });
    await vi.waitFor(() => expect(stateOf(current, hold)).toEqual({ state: 'running', attempts }), { timeout: 30_000, interval: 20 });
  });
});
