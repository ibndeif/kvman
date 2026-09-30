import Database from 'better-sqlite3';
import { kernelSchema } from './schema.ts';

// One SQLite database in WAL mode (plan 02 §2.5). The main thread and every worker each open their own connection.

export type Connection = Database.Database;

export const busyTimeoutMs = 5000;

export function openConnection(file: string): Connection {
  const connection = new Database(file);
  try {
    connection.pragma('journal_mode = WAL');
    connection.pragma(`busy_timeout = ${busyTimeoutMs}`);
    connection.pragma('synchronous = FULL');
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

// Opens the database and creates the kernel's tables; the main thread does this once, before any worker connects.
export function openDatabase(file: string): Connection {
  const connection = openConnection(file);
  try {
    connection.exec(kernelSchema);
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}
