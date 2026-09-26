import type { WorkspaceState, WorkspaceStates } from '../router/admission-context.ts';
import type { Connection } from '../storage/driver.ts';

// Which workspaces admission accepts (ADR 0122): those with a row, unless a forget has begun. The row is read in
// the connection's current transaction, so a batch sees the workspaces its earlier units opened.
export class WorkspaceDirectory implements WorkspaceStates {
  readonly #connection: Connection;
  readonly #forgetting = new Set<string>();

  constructor(connection: Connection) {
    this.#connection = connection;
  }

  stateOf(workspaceId: string): WorkspaceState {
    if (this.#forgetting.has(workspaceId)) return 'forgetting';
    return this.#connection.prepare('SELECT 1 AS found FROM workspaces WHERE id = ?').get(workspaceId) === undefined ? 'unknown' : 'open';
  }

  beginForgetting(workspaceId: string): void {
    this.#forgetting.add(workspaceId);
  }

  endForgetting(workspaceId: string): void {
    this.#forgetting.delete(workspaceId);
  }
}
