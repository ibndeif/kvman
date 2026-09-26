import { jsonObjectSchema, type ConfigChanged, type ConfigRow, type ConfigWriteScope, type JsonObject } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Connection } from './driver.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// A config row as stored, or { value: {}, revision: 0 } when there is none (ADR 0125).
export function readConfigRow(connection: Connection, extension: string, workspaceId: string | undefined): ConfigRow {
  const row = workspaceId === undefined
    ? connection.prepare('SELECT value, revision FROM global_config WHERE extension = ?').get(extension)
    : connection.prepare('SELECT value, revision FROM workspace_config WHERE workspace_id = ? AND extension = ?').get(workspaceId, extension);
  if (row === undefined) return { value: {}, revision: 0 };
  return { value: jsonObjectSchema.parse(JSON.parse(String(row['value']))), revision: Number(row['revision']) };
}

export type ConfigWriteRequest = { extension: string; scope: ConfigWriteScope; workspaceId: string | undefined; value: JsonObject; expectedRevision?: number };

function storeRow(scope: UnitScope, request: ConfigWriteRequest, revision: number): void {
  const value = JSON.stringify(request.value);
  if (request.scope === 'global') {
    scope.connection
      .prepare(`INSERT INTO global_config (extension, value, revision) VALUES (?, ?, ?)
        ON CONFLICT(extension) DO UPDATE SET value = excluded.value, revision = excluded.revision`)
      .run(request.extension, value, revision);
    return;
  }
  scope.connection
    .prepare(`INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, extension) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = excluded.updated_at`)
    .run(request.workspaceId ?? null, request.extension, value, revision, scope.now);
}

// 04 §4.2, 07 §7.5, ADR 0125: one config write in a unit: its revision, the merged value of its scope against the
// schema, the row with the next revision, and kernel.config.changed. Any failure rolls the unit back.
export function writeConfig(scope: UnitScope, request: ConfigWriteRequest): number {
  const { correlationId } = scope;
  if (request.scope === 'workspace' && request.workspaceId === undefined) {
    throw new UnitRejected(kernelProblem('WORKSPACE_INVALID', { correlationId, detail: 'a workspace config value needs a workspace', hint: 'write the global value' }));
  }
  const workspaceId = request.scope === 'global' ? undefined : request.workspaceId;
  const current = readConfigRow(scope.connection, request.extension, workspaceId);
  if (request.expectedRevision !== undefined && request.expectedRevision !== current.revision) {
    throw new UnitRejected(kernelProblem('CONFIG_STALE', { correlationId, detail: `the ${request.scope} config of ${request.extension} is at revision ${current.revision}, not ${request.expectedRevision}`, hint: 'read it again with kernel.config.get' }));
  }
  const global = request.scope === 'global' ? {} : readConfigRow(scope.connection, request.extension, undefined).value;
  const problem = scope.admission.checkConfig({ extension: request.extension, scope: request.scope, value: request.value, global, correlationId });
  if (problem !== undefined) throw new UnitRejected(problem);
  const revision = current.revision + 1;
  storeRow(scope, request, revision);
  const payload: ConfigChanged = { extension: request.extension, scope: request.scope, ...(workspaceId === undefined ? {} : { workspaceId }), revision };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.config.changed', payload });
  return revision;
}
