import type { CancelRequest, Message } from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection } from '../storage/driver.ts';

export type CancelScope = { messageIds: string[]; visited: Set<string> };

function childrenOf(connection: Connection, id: string): string[] {
  const messages = connection.prepare('SELECT id FROM messages WHERE causation_id = ?').all(id);
  const events = connection.prepare('SELECT id FROM events WHERE causation_id = ?').all(id);
  return [...messages, ...events].map((row) => String(row['id']));
}

// ADR 0083: every descendant of the message, walked through finished messages and events too, or every message of
// the correlation. `visited` also names the events and unstored deliveries' publishers for the scheduler.
export function cancelScope(connection: Connection, request: CancelRequest, cancel: Message, unstoredOf: (ids: ReadonlySet<string>) => string[]): CancelScope {
  if ('correlationId' in request) {
    const rows = connection.prepare('SELECT id FROM messages WHERE correlation_id = ?').all(request.correlationId);
    const messageIds = rows.map((row) => String(row['id'])).filter((id) => id !== cancel.id);
    return { messageIds, visited: new Set(messageIds) };
  }
  const visited = new Set<string>();
  for (let frontier = [request.messageId]; frontier.length > 0;) {
    const next: string[] = [];
    for (const id of frontier.filter((candidate) => !visited.has(candidate))) {
      visited.add(id);
      next.push(...childrenOf(connection, id), ...unstoredOf(new Set([id])));
    }
    frontier = next;
  }
  visited.delete(cancel.id);
  return { messageIds: [...visited], visited };
}

function sourceOf(connection: Connection, id: string): string | undefined {
  const row = connection.prepare('SELECT source FROM messages WHERE id = ?').get(id);
  return row === undefined ? undefined : String(row['source']);
}

// ADR 0079: a person, the kernel, an extension granted kernel.admin, or the actor that sent the named message (or
// the correlation's root message) may cancel; a target that does not exist leaves nothing to refuse.
export function mayCancel(connection: Connection, grants: GrantsSource, cancel: Message, request: CancelRequest): boolean {
  const { source } = cancel;
  if (source === 'kernel' || source.startsWith('user:')) return true;
  const extension = source.startsWith('ext:') ? source.slice('ext:'.length) : undefined;
  const granted = extension === undefined ? undefined : grants.capabilities(extension, cancel.workspaceId);
  if (granted?.requested.some((capability) => capability.name === 'kernel.admin') === true) return true;
  const target = sourceOf(connection, 'messageId' in request ? request.messageId : request.correlationId);
  return target === undefined || target === source;
}
