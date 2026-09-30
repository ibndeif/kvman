import { describe, expect, it } from 'vitest';
import { busyTimeoutMs, openDatabase } from '../../src/storage/database.ts';
import { useTemporaryHomes } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

const kernelTables = ['accepted_extensions', 'files', 'jobs', 'schedules', 'settings', 'store_documents', 'store_kv', 'workspaces'];

describe('the database (02 §2.5)', () => {
  it('M1.3-E1 kvman.db is in WAL mode with a busy timeout, has the kernel tables, and keeps its data', () => {
    const test = newHome();
    expect(test.connection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(test.connection.pragma('busy_timeout', { simple: true })).toBe(busyTimeoutMs);
    const tables = test.connection.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    expect(tables.map((table) => table.name)).toEqual(kernelTables);
    test.connection.prepare("INSERT INTO store_kv (extension, scope, key, value) VALUES ('@test/a', '', 'k', '1')").run();
    test.connection.close();
    test.connection = openDatabase(test.database);
    expect(test.connection.prepare('SELECT value FROM store_kv').get()).toEqual({ value: '1' });
  });
});
