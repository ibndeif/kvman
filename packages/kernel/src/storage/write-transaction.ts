import type { Connection } from './driver.ts';

// A write outside the commit pipeline (step rows, recorded values, claims): committed on its own before the effect
// it guards, on the single writer connection between pipeline batches.
export function inWriteTransaction(connection: Connection, write: () => void): void {
  connection.exec('BEGIN IMMEDIATE');
  try {
    write();
    connection.exec('COMMIT');
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}
