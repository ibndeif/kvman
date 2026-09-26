import type { BlobRefChange } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { UnitRejected, type UnitScope } from '../storage/unit-contents.ts';
import { addBlobRef, blobExists, blobRefNames, holdsBlob, removeBlobRef } from './blob-rows.ts';

function refused(scope: UnitScope, code: 'CAPABILITY_DENIED' | 'BLOB_NOT_FOUND' | 'WORKSPACE_INVALID', detail: string): UnitRejected {
  return new UnitRejected(kernelProblem(code, { correlationId: scope.correlationId, detail }));
}

function wsOf(scope: UnitScope, change: BlobRefChange): string {
  if (change.scope === 'global') return '';
  const workspaceId = scope.cause?.workspaceId;
  if (workspaceId === undefined) throw refused(scope, 'WORKSPACE_INVALID', 'this handler has no workspace; keep the blob in ctx.store.global');
  return workspaceId;
}

// ctx.store.blobs.keep and release (04 §4.3): a keep adds the extension's own reference to a blob it may read
// (ADR 0134); a release removes it, and a missing one is no error.
export function applyBlobRefChanges(scope: UnitScope, extension: string, changes: readonly BlobRefChange[]): void {
  for (const change of changes) {
    const ws = wsOf(scope, change);
    const ref = blobRefNames.kept(change.blobId);
    if (change.op === 'release') {
      removeBlobRef(scope.connection, change.blobId, extension, ws, ref);
      continue;
    }
    if (!scope.received.has(change.blobId) && !holdsBlob(scope.connection, extension, change.blobId, scope.now)) {
      throw refused(scope, 'CAPABILITY_DENIED', `${extension} may not read the blob ${change.blobId}, so it cannot keep it`);
    }
    if (!blobExists(scope.connection, change.blobId)) throw refused(scope, 'BLOB_NOT_FOUND', `no blob ${change.blobId} exists`);
    addBlobRef(scope.connection, change.blobId, { owner: extension, ws, ref, expiresAt: null });
  }
}
