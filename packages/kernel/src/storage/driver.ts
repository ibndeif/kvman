export type SqlValue = string | number | bigint | null;

export type SqlRow = Record<string, SqlValue>;

export type RunResult = { changes: number; lastInsertRowid: number };

export interface PreparedStatement {
  run(...values: SqlValue[]): RunResult;
  get(...values: SqlValue[]): SqlRow | undefined;
  all(...values: SqlValue[]): SqlRow[];
}

export interface Connection {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  pragma(statement: string): SqlValue | undefined;
  inTransaction(): boolean;
  close(): void;
}

export type OpenOptions = { readonly: boolean; fileMustExist: boolean };

export interface StorageDriver {
  open(file: string, options: OpenOptions): Connection;
}

export type StorageFailureKind = 'constraint' | 'busy' | 'full' | 'corrupt' | 'other';

export class StorageFailure extends Error {
  readonly kind: StorageFailureKind;

  constructor(kind: StorageFailureKind, message: string) {
    super(message);
    this.name = 'StorageFailure';
    this.kind = kind;
  }
}
