import { workspaceTrustSchema, type Json, type TrustChanged, type WorkspaceTrust } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// 07 §7.2, ADR 0137: a grant stores the trusted files; a revoke, or a change the gate finds, clears them.
export type TrustChange =
  | { kind: 'trust.grant'; workspaceId: string; trust: WorkspaceTrust }
  | { kind: 'trust.revoke'; workspaceId: string }
  // Published once: only a workspace that still has a record is closed.
  | { kind: 'trust.close'; workspaceId: string }
  // Boot step 6 (03 §3.9): `once` records last until the kernel restarts.
  | { kind: 'trust.clear-once' };

export function readTrust(connection: Connection, workspaceId: string): WorkspaceTrust | undefined {
  const row = connection.prepare('SELECT trust FROM workspaces WHERE id = ?').get(workspaceId);
  const stored = row?.['trust'];
  if (stored === null || stored === undefined) return undefined;
  const parsed = workspaceTrustSchema.safeParse(JSON.parse(String(stored)));
  if (!parsed.success) throw new StorageFailure('corrupt', `the trust record of workspace ${workspaceId} does not match its schema`);
  return parsed.data;
}

function announce(scope: UnitScope, workspaceId: string, trusted: boolean): void {
  const payload: TrustChanged = { workspaceId, trusted };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.trust.changed', payload });
}

function store(scope: UnitScope, workspaceId: string, trust: WorkspaceTrust | null): number {
  return scope.connection.prepare('UPDATE workspaces SET trust = ? WHERE id = ?').run(trust === null ? null : JSON.stringify(trust), workspaceId).changes;
}

export function applyTrustChange(scope: UnitScope, change: TrustChange): Json {
  if (change.kind === 'trust.clear-once') {
    scope.connection.prepare("UPDATE workspaces SET trust = NULL WHERE json_extract(trust, '$.mode') = 'once'").run();
    return {};
  }
  if (change.kind === 'trust.close') {
    if (readTrust(scope.connection, change.workspaceId) === undefined) return {};
    store(scope, change.workspaceId, null);
    announce(scope, change.workspaceId, false);
    return {};
  }
  const trust = change.kind === 'trust.grant' ? change.trust : null;
  if (store(scope, change.workspaceId, trust) === 0) {
    throw new UnitRejected(kernelProblem('WORKSPACE_INVALID', { correlationId: scope.correlationId, detail: `no workspace ${change.workspaceId} exists` }));
  }
  announce(scope, change.workspaceId, trust !== null);
  return {};
}
