import type { Stored } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';
import type { MessageDoc } from '../schemas/records.ts';

// The artifacts a collapsed turn changed, named in its final answer (ADR 0123, 2): read from the turn's stored results
// alone, so the line never changes once the turn is sent.

type Fields = { [key: string]: JsonValue };
const fields = (value: JsonValue | undefined): Fields => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {});

type ChangedArtifact = { id: string; title: string; seq: number };

function changedArtifact(message: Stored<MessageDoc>): ChangedArtifact | undefined {
  if (message.content['isError'] === true) return undefined;
  const details = fields(message.content['details']);
  if (details['connector'] !== 'artifact' || (details['command'] !== 'write' && details['command'] !== 'edit')) return undefined;
  const artifact = fields(details['artifact']);
  const id = artifact['id'];
  const title = artifact['title'];
  return typeof id === 'string' && typeof title === 'string' ? { id, title, seq: message.seq } : undefined;
}

/** The line each collapsed turn's final answer carries, naming the artifacts it changed, by turn id. */
export function collapsedArtifactLines(messages: readonly Stored<MessageDoc>[], collapsedThrough: number): Map<string, string> {
  const changed = new Map<string, Map<string, ChangedArtifact>>();
  for (const message of messages) {
    if (message.seq > collapsedThrough || message.kind !== 'toolResult' || message.turnId === null) continue;
    const artifact = changedArtifact(message);
    if (artifact === undefined) continue;
    const perTurn = changed.get(message.turnId) ?? new Map<string, ChangedArtifact>();
    const previous = perTurn.get(artifact.id);
    if (previous === undefined || artifact.seq > previous.seq) perTurn.set(artifact.id, artifact);
    changed.set(message.turnId, perTurn);
  }
  const lines = new Map<string, string>();
  for (const [turnId, perTurn] of changed) {
    const entries: string[] = [];
    for (const id of [...perTurn.keys()].sort()) {
      const artifact = perTurn.get(id);
      if (artifact !== undefined) entries.push(`${id} (${artifact.title})`);
    }
    lines.set(turnId, `\n\n[kvman: artifacts changed in this turn: ${entries.join(', ')}]`);
  }
  return lines;
}
