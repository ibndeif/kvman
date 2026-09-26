import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProblemError } from '@kvman/kernel';
import { describe, expect, it } from 'vitest';
import { temporaryHome } from '../daemon/harness.ts';
import { workspaceA } from '../hosts/harness.ts';
import { applyTestPreset, emptyGrant } from '../install/fixture-presets.ts';
import { installFixture, prepareHome } from '../install/fixture-snapshots.ts';
import { installTests, person } from '../install/harness.ts';
import desk from '../workspaces/fixtures/extensions/desk.ts';
import { bootHome, testHomeWorkspace } from './builtins.ts';

async function refusedBoot(home: string, homeWorkspace?: string): Promise<unknown> {
  return bootHome(home, homeWorkspace === undefined ? {} : { homeWorkspace }).then(
    async (booted) => {
      await booted.close();
      return undefined;
    },
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );
}

describe('the Home workspace and the secrets file at boot (plan 03 §3.9, 07 §7.1, ADRs 0126, 0127)', installTests, () => {
  it('M2.3-E47 first run creates and opens the Home folder; once forgotten, it is not recreated', async () => {
    const home = temporaryHome();
    const homeWorkspace = testHomeWorkspace(home);
    const first = await bootHome(home, { homeWorkspace });
    try {
      expect(existsSync(homeWorkspace)).toBe(true);
      const [row] = first.kernel.connection.prepare('SELECT id, name FROM workspaces').all();
      expect(row).toMatchObject({ name: 'kvman' });
      expect(first.kernel.connection.prepare("SELECT workspace_id, payload FROM events WHERE type = 'kernel.workspace.opened'").all()).toEqual([
        { workspace_id: null, payload: JSON.stringify({ workspaceId: row?.['id'] }) },
      ]);
      const submission = await first.kernel.runtime.submitCommand({ sender: person, idempotencyKey: 'e47', type: 'kernel.workspace.forget', payload: { workspaceId: String(row?.['id']) } });
      if (!submission.ok) throw new Error(submission.problem.code);
      expect(await first.kernel.runtime.awaitReply(submission.id)).toEqual({ ok: true, value: {} });
    } finally {
      await first.close();
    }
    const second = await bootHome(home, { homeWorkspace });
    try {
      expect(second.kernel.connection.prepare('SELECT id FROM workspaces').all()).toEqual([]);
    } finally {
      await second.close();
    }
  });

  it('M2.3-E48 a first run whose Home folder cannot be created fails and leaves no database', async () => {
    const home = temporaryHome();
    const homeWorkspace = testHomeWorkspace(home);
    mkdirSync(dirname(homeWorkspace), { recursive: true });
    writeFileSync(homeWorkspace, 'a file in the way');
    expect(await refusedBoot(home, homeWorkspace)).toMatchObject({ code: 'WORKSPACE_INVALID' });
    for (const file of ['kvman.db', 'kvman.db-wal', 'daemon.lock']) expect(existsSync(join(home, file))).toBe(false);
  });

  it('M2.3-E49 a secrets file that does not parse refuses the start; a valid one serves ctx.secrets.get', async () => {
    const home = temporaryHome();
    await prepareHome(home, async (connection, folder) => {
      await installFixture(connection, folder, { definition: desk, folder: fileURLToPath(new URL('../workspaces/fixtures/extensions/', import.meta.url)), entry: 'desk.ts' });
      applyTestPreset(connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, { '@acme/desk': emptyGrant });
    });
    const secrets = join(home, 'secrets.json');
    writeFileSync(secrets, '{"@acme/desk/apiKey": ');
    expect(await refusedBoot(home)).toMatchObject({ code: 'INTERNAL', detail: `${secrets} is not valid JSON` });
    expect(readFileSync(secrets, 'utf8')).toBe('{"@acme/desk/apiKey": ');
    writeFileSync(secrets, JSON.stringify({ '@acme/desk/apiKey': 'sk-boot-0123456789' }), { mode: 0o600 });
    const booted = await bootHome(home);
    try {
      const submission = await booted.kernel.runtime.submitCommand({ sender: person, idempotencyKey: 'e49', type: 'desk.settings', payload: {}, workspaceId: workspaceA });
      if (!submission.ok) throw new Error(submission.problem.code);
      expect(await booted.kernel.runtime.awaitReply(submission.id)).toMatchObject({ ok: true, value: { apiKey: 'sk-boot-0123456789' } });
    } finally {
      await booted.close();
    }
  });
});
