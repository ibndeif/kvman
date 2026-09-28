import { expect } from 'vitest';
import { eventually } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { rows } from '../workspaces/harness.ts';

export function stateOf(fixture: InstallFixture, messageId: string): { state: unknown; attempts: unknown } {
  const [row] = rows(fixture, 'SELECT state, attempts FROM messages WHERE id = ?', messageId);
  return { state: row?.['state'], attempts: row?.['attempts'] };
}

// The newest herald.fail or herald.fail-global message.
export function failId(fixture: InstallFixture): string {
  const [row] = rows(fixture, "SELECT id FROM messages WHERE type IN ('herald.fail', 'herald.fail-global') ORDER BY seq DESC LIMIT 1");
  return String(row?.['id']);
}

// herald.fail fails its first attempt, waits out its 1 s backoff, and fails its second: it is dead.
export async function deadAfterBackoff(fixture: InstallFixture, messageId: string): Promise<void> {
  await eventually(() => expect(stateOf(fixture, messageId)).toEqual({ state: 'pending', attempts: 1 }));
  fixture.timers.advance(1_000);
  await eventually(() => expect(stateOf(fixture, messageId).state).toBe('dead'));
}
