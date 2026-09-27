import { describe, expect, it } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { inspect } from './ledger-database.ts';
import {
  checkMigrationInvariant, globalConfigRevision, notesDigest, notesName, notesState, reloadedWorkspaces, reloadNotes, unanswered, until,
} from '../reload/child-harness.ts';
import { faultTests } from './crash-harness.ts';

const noGrants = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

function setBlockStep3(port: number, blockStep3: boolean): Promise<unknown> {
  return command(port, 'kernel.config.set', { extension: notesName, scope: 'global', value: { blockStep3 }, revision: 0 }, { wait: 30_000 });
}

describe('crashes around a reload and a migration (plan 14 §14.3, invariant 12)', faultTests, () => {
  it('M2.7-H4 a daemon killed mid-migration resumes and finishes the swap at boot', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'notes', faults: 'migration.mid' });
    const target = notesDigest(home, '3.0.0');
    await unanswered(reloadNotes(kernel.port, target));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    expect(notesState(home)).toMatchObject({ stored: 2, migrating: { digest: target } });
    const restarted = await launchKernel({ home, fixture: 'notes' });
    expect(notesState(home)).toMatchObject({ activeDigest: target, stored: 3, migrating: null, status: 'active' });
    expect(globalConfigRevision(home)).toBe(1);
    expect(reloadedWorkspaces(home)).toEqual([fixtureWorkspace]);
    checkMigrationInvariant(home);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });

  it('M2.7-E11 crash points of reload and migration keep invariant 12', async () => {
    for (const faults of ['reload.after-drain', 'reload.after-migrate-before-swap']) {
      const home = temporaryHome();
      const kernel = await launchKernel({ home, fixture: 'notes', faults });
      const target = notesDigest(home, '3.0.0');
      await unanswered(reloadNotes(kernel.port, target));
      expect(await kernel.exited, faults).toEqual({ code: null, signal: 'SIGKILL' });
      if (faults === 'reload.after-drain') expect(notesState(home), faults).toMatchObject({ activeDigest: notesDigest(home, '1.0.0'), migrating: null, stored: 1 });
      else expect(notesState(home), faults).toMatchObject({ migrating: { digest: target }, stored: 3 });
      const restarted = await launchKernel({ home, fixture: 'notes' });
      checkMigrationInvariant(home);
      await until(() => expect(inspect(home, (connection) => connection.prepare("SELECT state, result FROM messages WHERE type = 'kernel.extension.reload'").all()), faults)
        .toEqual([{ state: 'done', result: JSON.stringify({ ok: true, value: { digest: target } }) }]));
      expect(notesState(home), faults).toMatchObject({ activeDigest: target, stored: 3, migrating: null, status: 'active' });
      expect(globalConfigRevision(home), faults).toBe(1);
      expect(await restarted.stop(), faults).toEqual({ code: 0, signal: null });
    }
  });

  it('M2.7-E12 an interrupted enable is resumed at boot, which clears only migrating', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'notes-enable', faults: 'migration.mid' });
    await unanswered(command(kernel.port, 'kernel.extension.enable', { workspaceId: fixtureWorkspace, name: notesName, grants: noGrants }, { wait: 60_000 }));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const restarted = await launchKernel({ home, fixture: 'notes-enable' });
    expect(notesState(home)).toMatchObject({ stored: 3, migrating: null, status: 'active' });
    await until(() => expect(inspect(home, (connection) => connection.prepare("SELECT state FROM messages WHERE type = 'kernel.extension.enable'").all())).toEqual([{ state: 'done' }]));
    const preset = inspect(home, (connection) => String(connection.prepare('SELECT preset FROM workspace_presets WHERE workspace_id = ?').get(fixtureWorkspace)?.['preset']));
    expect(JSON.parse(preset)).toMatchObject({ extensions: { [notesName]: { enabled: true } } });
    expect(globalConfigRevision(home)).toBe(1);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });

  it('M2.7-E13 a resumption that fails at boot quarantines, and boot continues', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'notes', faults: 'migration.mid' });
    await setBlockStep3(kernel.port, true);
    const target = notesDigest(home, '3.0.0');
    await unanswered(reloadNotes(kernel.port, target));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const restarted = await launchKernel({ home, fixture: 'notes' });
    expect(notesState(home)).toMatchObject({ stored: 2, migrating: { digest: target }, status: 'quarantined', reason: 'MIGRATION_FAILED' });
    expect((await send(restarted.port, 'GET', '/api/v1/health')).json).toMatchObject({ status: 'degraded' });
    checkMigrationInvariant(home);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });
});
