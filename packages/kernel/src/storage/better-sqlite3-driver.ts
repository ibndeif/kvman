import Database from 'better-sqlite3';
import { StorageFailure, type Connection, type PreparedStatement, type SqlRow, type SqlValue, type StorageDriver, type StorageFailureKind } from './driver.ts';

function failureKind(code: string): StorageFailureKind {
  if (code.startsWith('SQLITE_CONSTRAINT')) return 'constraint';
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'busy';
  if (code.startsWith('SQLITE_FULL')) return 'full';
  if (code.startsWith('SQLITE_CORRUPT') || code.startsWith('SQLITE_NOTADB')) return 'corrupt';
  return 'other';
}

function translated<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof Database.SqliteError) throw new StorageFailure(failureKind(error.code), error.message);
    throw error;
  }
}

function asSqlValue(value: unknown): SqlValue | undefined {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  throw new StorageFailure('other', `a pragma returned a ${typeof value}, not a single value`);
}

function statementOf(statement: Database.Statement<SqlValue[], SqlRow>): PreparedStatement {
  return {
    run: (...values) => translated(() => {
      const result = statement.run(...values);
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
    }),
    get: (...values) => translated(() => statement.get(...values)),
    all: (...values) => translated(() => statement.all(...values)),
  };
}

function connectionOf(database: Database.Database): Connection {
  return {
    exec: (sql) => translated(() => void database.exec(sql)),
    prepare: (sql) => translated(() => statementOf(database.prepare<SqlValue[], SqlRow>(sql))),
    pragma: (statement) => translated(() => asSqlValue(database.pragma(statement, { simple: true }))),
    inTransaction: () => database.inTransaction,
    close: () => translated(() => void database.close()),
  };
}

export const betterSqlite3Driver: StorageDriver = {
  open(file, options) {
    return translated(() => connectionOf(new Database(file, { readonly: options.readonly, fileMustExist: options.fileMustExist })));
  },
};
