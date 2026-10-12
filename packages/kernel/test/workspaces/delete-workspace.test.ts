import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteWorkspace } from '../../src/workspaces/delete-workspace.ts';
import { createWorkspaces, listClosedWorkspaces } from '../../src/workspaces/workspaces.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const temporaryHome = useTemporaryHomes();
const folders: string[] = [];
const folder = (): string => {
  const made = mkdtempSync(path.join(tmpdir(), 'kvman-workspace-'));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

const tables = ['store_kv', 'store_documents', 'settings', 'files', 'jobs', 'schedules', 'processes'] as const;

// One row of `scope` in every table that holds a workspace's rows, and the content of its file.
function seed(test: TestHome, scope: string): string {
  const { connection } = test;
  const fileId = `file-${scope}`;
  connection.prepare("INSERT INTO store_kv (extension, scope, key, value) VALUES ('@test/x', ?, 'k', '1')").run(scope);
  connection.prepare("INSERT INTO store_documents (extension, scope, collection, id, data) VALUES ('@test/x', ?, 'c', 'd', '{}')").run(scope);
  connection.prepare("INSERT INTO settings (key, scope, value) VALUES ('x.setting', ?, '1')").run(scope);
  connection.prepare("INSERT INTO files (id, name, type, size, owner, workspace_id, created_at) VALUES (?, 'a.txt', 'text/plain', 1, '{}', ?, '2026-10-12T00:00:00.000Z')").run(fileId, scope);
  connection.prepare("INSERT INTO jobs (id, name, input, workspace_id, caller, status, attempts, retries, created_at, run_at, from_handler) VALUES (?, 'x.go', '{}', ?, '{}', 'queued', 0, 0, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z', 0)").run(`job-${scope}`, scope);
  connection.prepare("INSERT INTO schedules (id, owner, name, input, at, next_run, workspace_id, retries, from_handler) VALUES (?, '@test/x', 'x.go', '{}', '2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', ?, 0, 0)").run(`schedule-${scope}`, scope);
  connection.prepare("INSERT INTO processes (extension, workspace_id, name, pid, started_at) VALUES ('@test/x', ?, 'p', 1, '2026-10-12T00:00:00.000Z')").run(scope);
  mkdirSync(path.join(test.home, 'files'), { recursive: true });
  writeFileSync(path.join(test.home, 'files', fileId), 'x');
  return fileId;
}

const rowsOf = (test: TestHome, scope: string): number[] =>
  tables.map((table) => test.connection.prepare<[string], { count: number }>(`SELECT count(*) AS count FROM ${table} WHERE ${table.startsWith('store') || table === 'settings' ? 'scope' : 'workspace_id'} = ?`).get(scope)?.count ?? 0);

function world(test: TestHome) {
  const workspaces = createWorkspaces(test.connection, folder(), test.ids);
  const delivered: unknown[] = [];
  const stopped: string[] = [];
  const cancelled: string[] = [];
  const services = {
    connection: test.connection,
    home: test.home,
    workspaces,
    dispatcher: {
      cancelRunningIn: (workspaceId: string) => Promise.resolve(void cancelled.push(workspaceId)),
      deliverAlong: <Result>(work: (deliverIn: (point: string, input: Record<string, unknown>, workspaceId: string) => void) => Result): Result =>
        test.connection.transaction(() => work((point, input, workspaceId) => void delivered.push({ point, input, workspaceId })))(),
    },
    processes: { stop: (extension: string, workspaceId: string, name: string) => Promise.resolve(void stopped.push(`${extension}:${workspaceId}:${name}`)) },
  };
  return { workspaces, services, delivered, stopped, cancelled };
}

describe('deleting a closed workspace (02 §2.6, ADR 0061)', () => {
  it("M2.4-E203 every row of the workspace and its file's content go, with its work stopped first and the point delivered in Home; other data and the folder stay", async () => {
    const test = temporaryHome();
    const { workspaces, services, delivered, stopped, cancelled } = world(test);
    const gone = workspaces.open(folder(), () => undefined);
    const kept = workspaces.open(folder(), () => undefined);
    const goneFile = seed(test, gone.id);
    const keptFile = seed(test, kept.id);
    seed(test, '');
    workspaces.close(gone.id);

    await deleteWorkspace(services, gone.id);
    expect(rowsOf(test, gone.id)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(rowsOf(test, kept.id)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(rowsOf(test, '')).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(existsSync(path.join(test.home, 'files', goneFile))).toBe(false);
    expect(existsSync(path.join(test.home, 'files', keptFile))).toBe(true);
    expect(existsSync(gone.path)).toBe(true);
    expect(cancelled).toEqual([gone.id]);
    expect(stopped).toEqual([`@test/x:${gone.id}:p`]);
    expect(delivered).toEqual([{ point: 'kernel.workspace.deleted', input: { workspaceId: gone.id }, workspaceId: 'home' }]);
    expect(workspaces.closed()).toEqual([]);
    expect(listClosedWorkspaces(test.connection)).toEqual([]);
  });

  it('M2.4-E204 Home and an open workspace fail VALIDATION_FAILED and an unknown one NOT_FOUND, with nothing erased; one opened again while its work stops is kept', async () => {
    const test = temporaryHome();
    const { workspaces, services, delivered } = world(test);
    const open = workspaces.open(folder(), () => undefined);
    seed(test, open.id);
    await expect(deleteWorkspace(services, 'home')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(deleteWorkspace(services, open.id)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(deleteWorkspace(services, 'unknown')).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });

    workspaces.close(open.id);
    const reopening = { ...services, dispatcher: { ...services.dispatcher, cancelRunningIn: () => Promise.resolve(void workspaces.open(open.path, () => undefined)) } };
    await expect(deleteWorkspace(reopening, open.id)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(rowsOf(test, open.id)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(delivered).toEqual([]);
  });

  it('M2.4-E201 and E202 at start an open workspace whose folder is gone is closed, and the closed ones are listed in the order first opened with `missing`', () => {
    const test = temporaryHome();
    const homeFolder = folder();
    const first = createWorkspaces(test.connection, homeFolder, test.ids);
    const removed = first.open(folder(), () => undefined);
    const closed = first.open(folder(), () => undefined);
    const open = first.open(folder(), () => undefined);
    first.close(closed.id);
    rmSync(removed.path, { recursive: true });

    const second = createWorkspaces(test.connection, homeFolder, test.ids);
    expect([...second.closed()].sort()).toEqual([removed.id, closed.id].sort());
    expect(listClosedWorkspaces(test.connection)).toEqual([{ ...removed, missing: true }, { ...closed, missing: false }]);
    expect(listClosedWorkspaces(test.connection).map((workspace) => workspace.id)).not.toContain(open.id);
    mkdirSync(removed.path);
    expect(second.open(removed.path, () => undefined).id).toBe(removed.id);
  });
});
