import {
  compareByCodePoint, messagesListLimits, messagesListRequestSchema, messageSummarySchema, subscribersListRequestSchema,
  type MessagesListRequest, type MessagesListResult, type MessageSummary, type SubscribersListResult,
} from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { receivesEvent } from '../router/event-grants.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection, SqlRow, SqlValue } from '../storage/driver.ts';
import { priorityOfCode } from '../storage/message-rows.ts';
import { laneOfKey } from '../storage/stored-message.ts';
import type { ExtensionQueryAnswer } from './extension-queries.ts';
import { readWorkspace } from './workspace-rows.ts';

export type InspectionDeps = { connection: Connection; registry: () => KernelRegistry; grants: GrantsSource };

type Condition = { sql: string; parameters: SqlValue[] };

// ADR 0132: each filter matches exactly; `extension` also matches its event deliveries (`<extension>|subscription:…`).
function conditionsOf(request: MessagesListRequest): Condition[] {
  const conditions: Condition[] = [];
  if (request.state !== undefined) conditions.push({ sql: 'state = ?', parameters: [request.state] });
  if (request.type !== undefined) conditions.push({ sql: 'type = ?', parameters: [request.type] });
  if (request.workspaceId !== undefined) conditions.push({ sql: 'workspace_id = ?', parameters: [request.workspaceId] });
  if (request.correlationId !== undefined) conditions.push({ sql: 'correlation_id = ?', parameters: [request.correlationId] });
  if (request.extension !== undefined) {
    const { extension } = request;
    conditions.push({ sql: '(handler = ? OR substr(handler, 1, ?) = ?)', parameters: [extension, extension.length + 1, `${extension}|`] });
  }
  return conditions;
}

function present(value: SqlValue | undefined): SqlValue | undefined {
  return value === null ? undefined : value;
}

function summaryOf(row: SqlRow): MessageSummary {
  const lane = present(row['lane']);
  const optionalFields = {
    workspaceId: present(row['workspace_id']), lane: laneOfKey(lane === undefined ? undefined : String(lane)), causationId: present(row['causation_id']),
    deadlineAt: present(row['deadline_at']), notBefore: present(row['not_before']),
  };
  return messageSummarySchema.parse({
    id: row['id'], kind: row['kind'], type: row['type'], state: row['state'], source: row['source'], handler: row['handler'],
    priority: priorityOfCode(row['priority']), attempts: row['attempts'], correlationId: row['correlation_id'],
    createdAt: row['created_at'], updatedAt: row['updated_at'],
    ...Object.fromEntries(Object.entries(optionalFields).filter(([, value]) => value !== undefined)),
  });
}

// kernel.messages.list (admin, ADR 0132) and kernel.subscribers.list (ADR 0133).
export class InspectionQueries {
  readonly #deps: InspectionDeps;

  constructor(deps: InspectionDeps) {
    this.#deps = deps;
  }

  messages(payload: unknown): MessagesListResult {
    const request = messagesListRequestSchema.parse(payload);
    const conditions = conditionsOf(request);
    const where = conditions.length === 0 ? '' : ` WHERE ${conditions.map((condition) => condition.sql).join(' AND ')}`;
    const parameters = conditions.flatMap((condition) => condition.parameters);
    const { connection } = this.#deps;
    const total = Number(connection.prepare(`SELECT count(*) AS total FROM messages${where}`).get(...parameters)?.['total'] ?? 0);
    const rows = connection.prepare(`SELECT * FROM messages${where} ORDER BY seq DESC LIMIT ?`).all(...parameters, request.limit ?? messagesListLimits.defaultLimit);
    return { items: rows.map(summaryOf), total };
  }

  // The extensions enabled in the workspace that would receive the event, each with its granted calls there.
  subscribers(payload: unknown): ExtensionQueryAnswer<SubscribersListResult> {
    const { workspaceId, type } = subscribersListRequestSchema.parse(payload);
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${workspaceId} exists` };
    const registry = this.#deps.registry();
    const lookup = registry.lookup(type, workspaceId);
    if (!lookup.ok || lookup.resolved.entry.kind !== 'event') return { ok: true, value: [] };
    const event = { type, owner: lookup.resolved.extension, workspaceId };
    const names = new Set(registry.subscriptions(type, workspaceId).filter((subscriber) => receivesEvent(this.#deps.grants, event, subscriber)).map((subscriber) => subscriber.extension));
    const value = [...names].sort(compareByCodePoint).flatMap((name) => {
      const manifest = registry.manifestOf(name);
      if (manifest === undefined) return [];
      const granted = this.#deps.grants.capabilities(name, workspaceId)?.requested ?? [];
      return [{
        name, namespace: manifest.meta.namespace, title: manifest.meta.title, status: registry.isQuarantined(name) ? 'quarantined' as const : 'active' as const,
        calls: granted.flatMap((capability) => (capability.name === 'calls' ? capability.types : [])),
      }];
    });
    return { ok: true, value };
  }
}
